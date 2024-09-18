const express = require("express");
const router = express.Router();
const Notificacion = require("../models/notificaciones");

// Crear una nueva notificación (POST)
router.post('/', async (req, res) => {
  const { mensaje, userId } = req.body;

  if (!mensaje) {
    return res.status(400).json({ error: 'El mensaje es requerido' });
  }

  try {
    const nuevaNotificacion = await Notificacion.create({
      mensaje,
      userId,
      leida: false,
    });
    res.status(201).json({ message: 'Notificación creada con éxito', notificacion: nuevaNotificacion });
  } catch (error) {
    console.error('Error al crear la notificación:', error);
    res.status(500).json({ error: 'Error al crear la notificación' });
  }
});

// Obtener todas las notificaciones (GET)
router.get('/', async (req, res) => {
  try {
    const notificaciones = await Notificacion.find();
    res.status(200).json(notificaciones);
  } catch (error) {
    console.error('Error al obtener las notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
});

// Eliminar una notificación por ID (DELETE)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedNotificacion = await Notificacion.findByIdAndDelete(id);
    if (!deletedNotificacion) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }
    res.status(200).json({ message: 'Notificación eliminada con éxito' });
  } catch (error) {
    console.error('Error al eliminar la notificación:', error);
    res.status(500).json({ error: 'Error al eliminar la notificación' });
  }
});

// Marcar todas las notificaciones como leídas (PATCH)
router.patch('/marcarLeidas', async (req, res) => {
  try {
    await Notificacion.updateMany({ leida: false }, { $set: { leida: true } });
    res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
  } catch (error) {
    console.error('Error al marcar las notificaciones como leídas:', error);
    res.status(500).json({ error: 'Error al marcar las notificaciones como leídas' });
  }
});

module.exports = router;