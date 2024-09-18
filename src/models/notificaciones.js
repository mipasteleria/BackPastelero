const mongoose = require("mongoose");

const NotificacionSchema = new mongoose.Schema(
    {
    mensaje: String,
    userId: String,
    fecha: { 
        type: Date, 
        default: Date.now },
    leida: { 
        type: Boolean, 
        default: false },
    }
);

const Notificacion = mongoose.model("notificaciones", NotificacionSchema);

module.exports = Notificacion;