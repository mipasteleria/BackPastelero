const express = require("express");
const router = express.Router();
const Notificacion = require("../models/notificaciones");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;

// Todas las rutas requieren sesión. El alcance (qué notificaciones ve o
// borra cada quien) se resuelve en el servidor según el rol — antes se
// filtraba en el cliente, lo que enviaba TODAS las notificaciones a todos.
router.use(requireAuth);

const esAdmin = (req) => req.user?.role === "admin";

// Crear notificación — solo admin (avisos del negocio).
router.post('/', checkRoleToken("admin"), async (req, res) => {
  const { mensaje, userId } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'El mensaje es requerido' });
  try {
    const nuevaNotificacion = await Notificacion.create({ mensaje, userId, leida: false });
    res.status(201).json({ message: 'Notificación creada con éxito', notificacion: nuevaNotificacion });
  } catch (error) {
    console.error('Error al crear la notificación:', error);
    res.status(500).json({ error: 'Error al crear la notificación' });
  }
});

// Obtener notificaciones — admin: las del negocio (sin userId); usuario:
// solo las suyas.
router.get('/', async (req, res) => {
  try {
    const filtro = esAdmin(req)
      ? { $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }] }
      : { userId: String(req.user._id) };
    const notificaciones = await Notificacion.find(filtro).sort({ createdAt: -1 });
    res.status(200).json(notificaciones);
  } catch (error) {
    console.error('Error al obtener las notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
});

// Eliminar por ID — solo la propia (o cualquiera si es admin).
router.delete('/:id', async (req, res) => {
  try {
    const notif = await Notificacion.findById(req.params.id);
    if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
    const propia = String(notif.userId || "") === String(req.user._id);
    if (!esAdmin(req) && !propia) return res.status(403).json({ message: 'No autorizado' });
    await notif.deleteOne();
    res.status(200).json({ message: 'Notificación eliminada con éxito' });
  } catch (error) {
    console.error('Error al eliminar la notificación:', error);
    res.status(500).json({ error: 'Error al eliminar la notificación' });
  }
});

// Marcar como leídas — solo las del solicitante (admin: las del negocio).
router.patch('/marcarLeidas', async (req, res) => {
  try {
    const filtro = esAdmin(req)
      ? { leida: false, $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }] }
      : { leida: false, userId: String(req.user._id) };
    await Notificacion.updateMany(filtro, { $set: { leida: true } });
    res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
  } catch (error) {
    console.error('Error al marcar las notificaciones como leídas:', error);
    res.status(500).json({ error: 'Error al marcar las notificaciones como leídas' });
  }
});

module.exports = router;
