const { TranscoderServiceClient } = require("@google-cloud/video-transcoder").v1;

/**
 * Integración con Google Cloud Transcoder API para los cursos.
 *
 * Toma un video crudo subido a GCS (cursos/raw/...) y genera en
 * cursos/out/<id>/ los formatos estándar web:
 *   - HLS  (hls.m3u8)  con segmentos TS de 10 s
 *   - DASH (dash.mpd)  con segmentos fMP4 de 10 s
 * en 3 tamaños: móvil (640x360), tablet (1280x720) y monitor (1920x1080).
 *
 * Usa las mismas credenciales GCS_CREDENTIALS/PROJECT_ID que el resto del
 * sistema. Requiere habilitar la Transcoder API en el proyecto y dar al
 * service account el rol "Transcoder Admin" (roles/transcoder.admin).
 */

const LOCATION = process.env.TRANSCODER_LOCATION || "us-central1";

let client = null;
function getClient() {
  if (client) return client;
  try {
    const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined;
    client = new TranscoderServiceClient({ projectId: process.env.PROJECT_ID, credentials });
  } catch (e) {
    console.error("[transcoder] init falló:", e.message);
  }
  return client;
}

const SEG_DUR = { seconds: 10 };

// 3 renditions de video + 1 de audio.
const ELEMENTARY_STREAMS = [
  {
    key: "video-360",
    videoStream: { h264: { heightPixels: 360, widthPixels: 640, bitrateBps: 800000, frameRate: 30 } },
  },
  {
    key: "video-720",
    videoStream: { h264: { heightPixels: 720, widthPixels: 1280, bitrateBps: 2500000, frameRate: 30 } },
  },
  {
    key: "video-1080",
    videoStream: { h264: { heightPixels: 1080, widthPixels: 1920, bitrateBps: 5000000, frameRate: 30 } },
  },
  {
    key: "audio",
    audioStream: { codec: "aac", bitrateBps: 128000 },
  },
];

// HLS: TS por rendition · DASH: fMP4 por rendition.
const MUX_STREAMS = [
  { key: "hls-360",  container: "ts",  elementaryStreams: ["video-360", "audio"],  segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "hls-720",  container: "ts",  elementaryStreams: ["video-720", "audio"],  segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "hls-1080", container: "ts",  elementaryStreams: ["video-1080", "audio"], segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "dash-360",  container: "fmp4", elementaryStreams: ["video-360"],  segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "dash-720",  container: "fmp4", elementaryStreams: ["video-720"],  segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "dash-1080", container: "fmp4", elementaryStreams: ["video-1080"], segmentSettings: { segmentDuration: SEG_DUR } },
  { key: "dash-audio", container: "fmp4", elementaryStreams: ["audio"], segmentSettings: { segmentDuration: SEG_DUR } },
];

const MANIFESTS = [
  { fileName: "hls.m3u8", type: "HLS",  muxStreams: ["hls-360", "hls-720", "hls-1080"] },
  { fileName: "dash.mpd", type: "DASH", muxStreams: ["dash-360", "dash-720", "dash-1080", "dash-audio"] },
];

/**
 * Crea un job de transcodificación.
 * @param {string} inputUri  gs://bucket/cursos/raw/archivo.mp4
 * @param {string} outputUri gs://bucket/cursos/out/<id>/ (con / final)
 * @returns {Promise<string>} jobName (projects/.../jobs/...)
 */
async function crearJob(inputUri, outputUri) {
  const c = getClient();
  if (!c) throw new Error("Transcoder no configurado");
  const parent = c.locationPath(process.env.PROJECT_ID, LOCATION);
  const [job] = await c.createJob({
    parent,
    job: {
      inputUri,
      outputUri,
      config: {
        elementaryStreams: ELEMENTARY_STREAMS,
        muxStreams: MUX_STREAMS,
        manifests: MANIFESTS,
        // Sprite para elegir thumbnail (1 frame cada 5 s, hasta 100).
        spriteSheets: [{
          filePrefix: "thumbs",
          spriteWidthPixels: 320,
          spriteHeightPixels: 180,
          interval: { seconds: 5 },
        }],
      },
    },
  });
  return job.name;
}

/** Estado del job: PENDING | RUNNING | SUCCEEDED | FAILED */
async function estadoJob(jobName) {
  const c = getClient();
  if (!c) throw new Error("Transcoder no configurado");
  const [job] = await c.getJob({ name: jobName });
  return { state: job.state, error: job.error?.message || null };
}

module.exports = { crearJob, estadoJob };
