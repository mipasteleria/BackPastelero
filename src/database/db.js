const mongoose = require("mongoose");

if (!process.env.MONGO_URL) {
  throw new Error("MONGO_URL no está definida en el entorno (.env)");
}

/**
 * Conexión a MongoDB Atlas — diseñada para entornos serverless (Vercel).
 *
 * Problema que resolvemos:
 *   En Vercel cada función puede arrancar fría: el módulo se evalúa,
 *   mongoose.connect() se inicia, pero los handlers HTTP pueden ejecutarse
 *   antes de que la conexión esté lista. mongoose bufferea queries por
 *   defecto, pero con cold-start de Atlas + bcrypt de password (~2-3 s)
 *   a veces excede el timeout de 10s de Vercel y devuelve 504.
 *
 * Solución:
 *   1) Iniciar la conexión al cargar el módulo (compartido entre invocaciones
 *      tibias del mismo container).
 *   2) Exportar `ensureConnection()` para que el app.use() del middleware
 *      pueda awaitear antes de procesar cualquier request.
 *   3) `serverSelectionTimeoutMS: 8000` para fail-fast antes del timeout de
 *      Vercel (10s). Mejor 503 claro que 504 ambiguo.
 */
const connectionPromise = mongoose
  .connect(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    family: 4, // IPv4 → más rápido en Vercel que dual-stack
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    // Re-throw para que ensureConnection() también vea el rechazo
    throw err;
  });

const connect = connectionPromise.then(() => "Success connection to DB");

/**
 * Asegura que la conexión a MongoDB esté lista antes de proceder.
 * Idempotente: si ya está conectada, retorna inmediatamente.
 */
async function ensureConnection() {
  if (mongoose.connection.readyState === 1) return;
  await connectionPromise;
}

module.exports = {
  connect,
  ensureConnection,
};
