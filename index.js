const express = require("express");
require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const mongoose = require("mongoose");
const http = require('http'); 
const { Server } = require('socket.io'); 
const app = express();
const port = process.env.PORT || 3001;
const mongoDB = require("./src/database/db.js");
const usersRoutes = require("./src/routes/users.js");
const pricesCakeRoutes = require("./src/routes/pastelCotiza.js");
const pricesCupcakesRoutes = require("./src/routes/cupcakesCotiza.js");
const pricesSnackRoutes = require("./src/routes/snackCotiza.js");
const insumosRoutes = require("./src/routes/insumos.js");
const recetasRoutes = require("./src/routes/recetas");
const ingredientesRoutes = require("./src/routes/recetas/ingredientes");
const costsRoutes = require("./src/routes/costs.js");
const createCheckoutSession = require("./src/routes/create-payment-intent/server.js");
const punycode = require("punycode");

const sendConfirmationEmail = require("./src/routes/create-payment-intent/confirmationEmail.js");
const cors = require("cors");

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/users", usersRoutes);
app.use("/pricecake", pricesCakeRoutes);
app.use("/pricecupcake", pricesCupcakesRoutes);
app.use("/pricesnack", pricesSnackRoutes);
app.use("/insumos", insumosRoutes);
app.use("/recetas", recetasRoutes);
app.use("/recetas/ingredientes", ingredientesRoutes);
app.use("/checkout", createCheckoutSession);
app.use("/costs", costsRoutes)

app.get("/", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Estás en Línea</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f0f4f8;
                    font-family: Arial, sans-serif;
                    text-align: center;
                }
                .container {
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    max-width: 400px;
                    width: 100%;
                }
                h1 {
                    color: #333333;
                    margin-bottom: 20px;
                }
                p {
                    color: #555555;
                    font-size: 1.1em;
                }
                .button {
                    display: inline-block;
                    margin-top: 20px;
                    padding: 10px 20px;
                    background-color: #007bff;
                    color: #ffffff;
                    text-decoration: none;
                    border-radius: 4px;
                    font-size: 1em;
                    transition: background-color 0.3s ease;
                }
                .button:hover {
                    background-color: #0056b3;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>¡Estás en Línea!</h1>
                <p>Tu backend está funcionando correctamente. Si ves este mensaje, significa que todo está configurado bien.</p>
                <a href="/" class="button">Volver al Inicio</a>
            </div>
        </body>
        </html>
    `);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permite todas las solicitudes de origen
    methods: ["GET", "POST"]
  }
});

const NotificacionSchema = new mongoose.Schema({
  mensaje: String,
  nombreUsuario: String,
  userId: String,
  fecha: { type: Date, default: Date.now },
  leida: { type: Boolean, default: false },
});

const Notificacion = mongoose.model('Notificacion', NotificacionSchema);

// Manejar conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado');

  // Registrar usuario con su ID de usuario cuando se conecte
  socket.on('registrarUsuario', (userId) => {
    socket.join(userId); // Unirse a una "sala" específica para este usuario
    console.log(`Usuario registrado en la sala: ${userId}`);
  });

  socket.on('solicitarCotizacion', async (data) => {
    console.log('Nueva solicitud de cotización recibida:', data);

    const nuevaNotificacion = new Notificacion({
      mensaje: `Nueva solicitud de ${data.mensaje} recibida de ${data.nombreUsuario}.`,
      nombreUsuario: data.nombreUsuario,
    });

    await nuevaNotificacion.save();
  });

  socket.on('aprobarCotizacion', async (data) => {
    console.log('Cotización aprobada:', data);

    const nuevaNotificacion = new Notificacion({
      mensaje: `${data.nombreUsuario} Tu cotización de ${data.priceType} ha sido aprobada.`,
      nombreUsuario: data.nombreUsuario,
      userId: data.userId, // Usuario que recibirá la notificación
    });

    await nuevaNotificacion.save();
    io.to(data.userId).emit('nuevaNotificacion', nuevaNotificacion); // Enviar notificación al usuario específico
  });

  socket.on('pagoRealizado', async (data) => {
    console.log('Pago Realizado:', data);

    const nuevaNotificacion = new Notificacion({
      mensaje: `Compra completada por ${data.customer_email}`,
      nombreUsuario: data.nombreUsuario,
      userId: data.userId, // Usuario que recibirá la notificación
    });

    await nuevaNotificacion.save();
    io.to(data.userId).emit('nuevaNotificacion', nuevaNotificacion); // Enviar notificación al usuario específico
  });

  socket.on('disconnect', () => {
    console.log('Un usuario se ha desconectado');
  });
});


app.get('/notificaciones', async (req, res) => {
  try {
    // Obtener todas las notificaciones de la base de datos
    const notificaciones = await Notificacion.find();
    res.status(200).json(notificaciones);
  } catch (error) {
    console.error('Error al obtener las notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
});

app.delete('/notificaciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Notificacion.findByIdAndDelete(id);
    res.status(200).json({ message: 'Notificación eliminada con éxito' });
  } catch (error) {
    console.error('Error al eliminar la notificación:', error);
    res.status(500).json({ error: 'Error al eliminar la notificación' });
  }
});

// Ruta para marcar notificaciones como leídas
app.patch('/notificaciones/marcarLeidas', async (req, res) => {
  try {
    await Notificacion.updateMany({ leida: false }, { $set: { leida: true } });
    res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
  } catch (error) {
    console.error('Error al marcar las notificaciones como leídas:', error);
    res.status(500).json({ error: 'Error al marcar las notificaciones como leídas' });
  }
});

const storage = new Storage({
  projectId: process.env.PROJECT_ID,
  keyFilename: process.env.KEYFILENAME,
});

const bucketName = process.env.BUCKET_NAME;

// Configuración de multer para usar Google Cloud Storage directamente
const upload = multer({
  storage: multer.memoryStorage(), // Usar memoria para multer
});

async function uploadFileToGCS(file, bucketName) {
  try {
    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(file.originalname);
    const blobStream = blob.createWriteStream({
      resumable: false,
      gzip: true,
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => reject(err));
      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${file.originalname}`;
        resolve({ message: "File uploaded successfully", fileUrl: publicUrl });
      });
      blobStream.end(file.buffer);
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

// Subir imagen
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const uploadPromises = req.files.map(file =>
      uploadFileToGCS(file, bucketName)
    );

    const results = await Promise.all(uploadPromises);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Error uploading files" });
  }
});

// Ver imagen
app.get("/image-url/:filename", async (req, res) => {
  try {
    const fileName = req.params.filename;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hora
    });

    res.status(200).json({ url });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ error: "Error generating signed URL" });
  }
});

mongoDB.connect
  .then((message) => {
    console.log(message);
    server.listen(port, () => {
      console.log("Server is listening on port", port);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Something broke!" });
});
