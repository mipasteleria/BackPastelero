const jwt = require("jsonwebtoken");

/**
 * Renovación deslizante de sesión.
 *
 * Problema: el token dura 8 h y no se renovaba, así que al llegar al
 * límite sacaba al usuario aunque estuviera trabajando. En el punto de
 * venta eso interrumpe un cobro.
 *
 * Solución: en cada petición autenticada, si al token ya le pasó la
 * mitad de su vida, se emite uno nuevo y se devuelve en la cabecera
 * `X-Token-Renovado`. El navegador lo guarda y sigue. Quien está activo
 * no se queda fuera; quien dejó la sesión abierta y se fue, sí expira.
 *
 * Va DESPUÉS de las rutas que ponen `req.user` (lo hace checkRoleToken),
 * montado globalmente para no tener que tocar ruta por ruta.
 */
function renovarTokenSiExpira(req, res, next) {
  const original = res.json.bind(res);

  res.json = (body) => {
    try {
      const u = req.user;
      // `exp` e `iat` vienen en segundos desde epoch.
      if (u?.exp && u?.iat) {
        const ahora = Math.floor(Date.now() / 1000);
        const vida = u.exp - u.iat;
        const transcurrido = ahora - u.iat;
        if (vida > 0 && transcurrido > vida / 2 && u.exp > ahora) {
          // Se re-firma el mismo contenido; `exp`/`iat` los pone jwt.
          const { exp, iat, ...payload } = u;
          const nuevo = jwt.sign(payload, process.env.JWT_SIGN, { expiresIn: "8h" });
          res.setHeader("X-Token-Renovado", nuevo);
          res.setHeader("Access-Control-Expose-Headers", "X-Token-Renovado");
        }
      }
    } catch (e) {
      // Nunca romper la respuesta por no poder renovar.
      console.error("[renovarToken]", e.message);
    }
    return original(body);
  };

  next();
}

module.exports = { renovarTokenSiExpira };
