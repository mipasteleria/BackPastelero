const express = require("express");
const router = express.Router();
const User = require("../models/users");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Registro (endpoint público)
// IMPORTANTE: solo tomamos los campos permitidos del body. NUNCA aceptamos
// `role` del cliente (sería escalada de privilegios). El rol siempre es "user".
router.post("/", async (req, res) => {
  try {
    const { name, lastname, email, password, phone } = req.body || {};

    if (!name || !lastname || !email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    const hashed = await User.encryptPassword(password);
    const newUser = new User({
      name,
      lastname,
      email,
      password: hashed,
      phone,
      role: "user",
    });
    await newUser.save();

    const { password: _ignored, ...safeUser } = newUser.toObject();
    res
      .status(201)
      .send({ message: "User created successfully", data: safeUser });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while creating the user",
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // Normalizar email igual que el schema (lowercase + trim) para evitar
    // que diferencias de mayúsculas hagan fallar la búsqueda.
    const normalizedEmail = (email || "").toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !(await User.isValidPassword(password, user.password))) {
      return res.status(401).send({ message: "Invalid email or password" });
    }

    const token = await User.createToken({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });
    res.status(200).send({ message: "Login Success", token: token });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred during login",
      error,
    });
  }
});

// Perfil del usuario autenticado. Devuelve el rol verificado contra la BD
// (nunca confiamos en lo que diga el JWT sobre rol sin ratificarlo).
// El front lo usa para saber si es admin en vez de hacer jwt.decode().
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.status(200).json({ data: user });
  } catch (error) {
    console.error("Error en /users/me:", error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
});

// Recuperar listado (sin exponer hashes de password)
router.get("/list", checkRoleToken("admin"), async (req, res) => {
  try {
    const usersData = await User.find().select("-password");
    res.send({ message: "All users", data: usersData });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while retrieving users",
      error,
    });
  }
});

// Ruta para obtener un usuario por ID (sin password)
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario encontrado", data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
});

// Ruta para actualizar un usuario — solo admin
// Si viene `password` lo hasheamos antes de guardar. Nunca devolvemos el hash.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    if (payload.password) {
      payload.password = await User.encryptPassword(payload.password);
    }

    const updatedUser = await User.findByIdAndUpdate(id, payload, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res
      .status(200)
      .json({ message: "Usuario actualizado con éxito", data: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el usuario" });
  }
});

// Ruta para eliminar un usuario
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ message: "ID de usuario no proporcionado" });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario eliminado con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar el usuario" });
  }
});

// POST /users/forgot-password — solicitar restablecimiento de contraseña
// Endpoint público: no requiere auth.
// Siempre responde con el mismo mensaje para no revelar si el email existe.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "Email requerido" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Log diagnóstico (no expone datos sensibles al cliente)
    console.log(`[forgot-password] email solicitado: ${normalizedEmail} | usuario encontrado: ${!!user}`);

    if (user) {
      // Generar token seguro; guardamos el hash en DB (si la DB se filtra el token plano no sirve)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
      await user.save();

      const frontDomain = (process.env.FRONT_DOMAIN || "http://localhost:3000").replace(/\/$/, "");
      const resetUrl = `${frontDomain}/reset-password/${rawToken}`;

      console.log(`[forgot-password] FRONT_DOMAIN: ${process.env.FRONT_DOMAIN || "(no configurado)"}`);
      console.log(`[forgot-password] EMAIL_USER configurado: ${!!process.env.EMAIL_USER}`);
      console.log(`[forgot-password] EMAIL_PASS configurado: ${!!process.env.EMAIL_PASS}`);
      console.log(`[forgot-password] reset URL: ${resetUrl}`);

      // Separamos el try-catch del email para que un fallo de envío
      // no devuelva 500 al cliente (seguridad) pero sí quede en logs.
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: "Recupera tu contraseña — El Ruiseñor",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff1f2;border-radius:12px;padding:32px;">
              <h2 style="color:#540027;font-size:1.5rem;margin-bottom:8px;">Restablece tu contraseña</h2>
              <p style="color:#333;line-height:1.6;">Hola <strong>${user.name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
              <p style="color:#333;line-height:1.6;">Haz clic en el botón para elegir una nueva contraseña. El enlace es válido por <strong>1 hora</strong>.</p>
              <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:14px 32px;background:#540027;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:0.95rem;">
                Restablecer contraseña
              </a>
              <p style="color:#888;font-size:0.82rem;line-height:1.6;">Si no solicitaste este cambio, ignora este correo — tu contraseña no cambiará.</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
              <p style="color:#bbb;font-size:0.75rem;">Pastelería El Ruiseñor · Guadalajara, Jalisco</p>
            </div>
          `,
        });

        console.log(`[forgot-password] email enviado correctamente a ${user.email}`);
      } catch (emailError) {
        // Loguear el error real pero no exponer al cliente
        console.error(`[forgot-password] ERROR al enviar email a ${user.email}:`, emailError.message);
      }
    }

    // Respuesta genérica siempre: no revelar si el usuario existe o no
    res.status(200).json({ message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña." });
  } catch (error) {
    console.error("Error general en /forgot-password:", error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
});

// POST /users/reset-password/:token — establecer nueva contraseña con el token
// Endpoint público: el token crudo viene en la URL, se compara contra el hash en DB.
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ message: "Token y contraseña son requeridos" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "El enlace es inválido o ha expirado. Solicita uno nuevo." });
    }

    const hashedPassword = await User.encryptPassword(password);

    // Usar findByIdAndUpdate para actualizar solo los campos relevantes sin
    // ejecutar validators del schema completo (evita fallos por campos legacy
    // como teléfono con formato distinto al regex actual).
    await User.findByIdAndUpdate(user._id, {
      $set:   { password: hashedPassword },
      $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
    });

    console.log(`[reset-password] contraseña actualizada para userId: ${user._id}`);
    res.status(200).json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
  } catch (error) {
    console.error("Error en /reset-password:", error);
    res.status(500).json({ message: "Error al actualizar la contraseña" });
  }
});

module.exports = router;
