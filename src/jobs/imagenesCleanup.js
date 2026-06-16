const cron = require("node-cron");
const { Storage } = require("@google-cloud/storage");
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");

/**
 * Limpieza de imágenes de inspiración de las cotizaciones personalizadas.
 *
 * Para controlar el volumen de almacenamiento en GCS aplicamos retención:
 *
 *  - Cotización COMPRADA (status "Agendado · revisión" / "Agendado ·
 *    producción" / "Entregado"): las imágenes se conservan hasta 1 mes
 *    DESPUÉS de la fecha de entrega.
 *
 *  - Cotización NO comprada (Pendiente / Cancelado / etc.): las imágenes
 *    se borran 1 semana DESPUÉS de que vence la validez (la validez es de
 *    30 días desde el envío → borrado a los ~37 días).
 *
 * El borrado limpia los archivos en GCS y vacía
 * `estilo.imagenesInspiracion`, marcando `imagenesEliminadasAt` para no
 * reprocesar.
 *
 * NOTA serverless: en Vercel `node-cron` no corre de forma confiable
 * (la función no está siempre viva). Por eso `runImagenesCleanup` se
 * expone para poder dispararlo también vía un endpoint HTTP protegido
 * (Vercel Cron). En servidor local sí se registra el cron directamente.
 */

const STATUSES_COMPRADA = [
  "Agendado · revisión",
  "Agendado · producción",
  "Entregado",
];

const VALIDEZ_DIAS = 30;
const MS_DIA = 86400000;

function buildStorage() {
  try {
    const gcsCredentials = process.env.GCS_CREDENTIALS
      ? JSON.parse(process.env.GCS_CREDENTIALS)
      : undefined;
    return new Storage({ projectId: process.env.PROJECT_ID, credentials: gcsCredentials });
  } catch (e) {
    console.error("[imagenesCleanup] GCS init failed:", e.message);
    return null;
  }
}

// Las imágenes se sirven como `<API_BASE>/file/<filename>`. Extraemos el
// nombre de archivo de la URL para poder borrarlo del bucket.
function filenameFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/file\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function borrarImagenes(storage, bucketName, urls) {
  if (!storage || !bucketName) return 0;
  const bucket = storage.bucket(bucketName);
  let borradas = 0;
  for (const url of urls) {
    const filename = filenameFromUrl(url);
    if (!filename) continue;
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) continue; // seguridad
    try {
      await bucket.file(filename).delete({ ignoreNotFound: true });
      borradas++;
    } catch (e) {
      console.error(`[imagenesCleanup] No se pudo borrar ${filename}:`, e.message);
    }
  }
  return borradas;
}

// Calcula la fecha a partir de la cual las imágenes deben borrarse.
// Devuelve null si no hay suficiente info para decidir.
function fechaBorrado(cot) {
  const comprada = STATUSES_COMPRADA.includes(cot.status);
  if (comprada) {
    const entrega = cot.entrega?.fecha || cot.evento?.fecha;
    if (!entrega) return null;
    return new Date(new Date(entrega).getTime() + 30 * MS_DIA);
  }
  // No comprada: 1 semana después de vencer la validez.
  const venceValidez = cot.validUntil
    ? new Date(cot.validUntil)
    : new Date(new Date(cot.createdAt).getTime() + VALIDEZ_DIAS * MS_DIA);
  return new Date(venceValidez.getTime() + 7 * MS_DIA);
}

async function runImagenesCleanup() {
  const storage = buildStorage();
  const bucketName = process.env.BUCKET_NAME;
  const now = new Date();

  // Sólo cotizaciones con imágenes y que aún no se hayan limpiado.
  const candidatas = await CotizacionPersonalizada.find({
    imagenesEliminadasAt: null,
    "estilo.imagenesInspiracion.0": { $exists: true },
  });

  let procesadas = 0;
  let totalBorradas = 0;

  for (const cot of candidatas) {
    const cutoff = fechaBorrado(cot);
    if (!cutoff || now < cutoff) continue;

    const urls = cot.estilo?.imagenesInspiracion || [];
    const borradas = await borrarImagenes(storage, bucketName, urls);

    cot.estilo.imagenesInspiracion = [];
    cot.imagenesEliminadasAt = now;
    await cot.save();

    procesadas++;
    totalBorradas += borradas;
    console.log(
      `[imagenesCleanup] Cotización ${cot._id}: ${borradas} imagen(es) borradas (status: ${cot.status}).`
    );
  }

  if (procesadas === 0) {
    console.log("[imagenesCleanup] Sin imágenes que limpiar hoy.");
  } else {
    console.log(
      `[imagenesCleanup] Limpieza completa: ${procesadas} cotización(es), ${totalBorradas} archivo(s).`
    );
  }

  return { procesadas, totalBorradas };
}

// Corre todos los días a las 03:00 hora del servidor (sólo en local).
function startImagenesCleanupCron() {
  cron.schedule("0 3 * * *", async () => {
    console.log("[imagenesCleanup] Ejecutando limpieza diaria...");
    try {
      await runImagenesCleanup();
    } catch (err) {
      console.error("[imagenesCleanup] Error inesperado:", err.message);
    }
  });

  console.log("[imagenesCleanup] Cron de limpieza registrado (03:00 diario)");
}

module.exports = { startImagenesCleanupCron, runImagenesCleanup };
