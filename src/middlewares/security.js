const rateLimit = require("express-rate-limit");

/**
 * Utilidades de seguridad: rate-limiters y logging de eventos sospechosos.
 *
 * En Vercel las funciones corren detrás de un proxy, así que la IP real
 * viene en X-Forwarded-For. `app.set("trust proxy", 1)` (en index.js) hace
 * que req.ip la resuelva correctamente para el rate-limit.
 */

// IP del cliente (respeta el proxy de Vercel).
function clientIp(req) {
  return req.ip || (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
}

/**
 * Log estructurado de un evento de seguridad. Sale por stderr/stdout, que
 * en Vercel queda en los logs del proyecto. Formato JSON de una línea para
 * poder filtrar/alertar (ej. `SEC_EVENT` + tipo) desde el dashboard o un
 * drain a Logtail/Sentry.
 */
function logSecEvent(tipo, req, extra = {}) {
  const rec = {
    tag: "SEC_EVENT",
    tipo,
    ts: new Date().toISOString(),
    ip: clientIp(req),
    method: req.method,
    path: req.originalUrl || req.path,
    ua: (req.headers["user-agent"] || "").slice(0, 120),
    userId: req.user?._id || req.user?.id || null,
    ...extra,
  };
  console.warn(JSON.stringify(rec));
}

const msg = { message: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." };

// Login / recuperación de contraseña: frena fuerza bruta y enumeración.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                       // 10 intentos / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: msg,
  handler: (req, res, _next, options) => {
    logSecEvent("rate_limit_auth", req);
    res.status(options.statusCode).json(options.message);
  },
});

// Envío de correos y consulta de pedidos por número: frena spam/enumeración.
const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg,
  handler: (req, res, _next, options) => {
    logSecEvent("rate_limit_sensitive", req);
    res.status(options.statusCode).json(options.message);
  },
});

// Límite global suave: contiene abuso masivo sin estorbar el uso normal.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,                      // 120 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: msg,
  skip: (req) => req.path === "/health" || req.path.startsWith("/video-stream") || req.path === "/webhook/stripe",
});

/**
 * Middleware que registra respuestas 401/403 (accesos no autorizados a
 * rutas protegidas — señal de tanteo de rutas admin).
 */
function logForbidden(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecEvent("auth_denied", req, { status: res.statusCode });
    }
  });
  next();
}

module.exports = { authLimiter, sensitiveLimiter, globalLimiter, logForbidden, logSecEvent, clientIp };
