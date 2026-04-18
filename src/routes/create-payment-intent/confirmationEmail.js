const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

router.post('/send-confirmation-email', async (req, res) => {
  const { email, customerName, orderDetails } = req.body;

  // Configurar el transportador de nodemailer
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // tu dirección de correo
      pass: process.env.EMAIL_PASS, // tu contraseña
    },
  });

  // Configurar el contenido del correo
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Confirmación de tu pedido',
    text: `Hola ${customerName}, gracias por tu compra. Aquí están los detalles de tu pedido: ${orderDetails}.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Correo enviado correctamente' });
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    res.status(500).json({ message: 'Error al enviar el correo' });
  }
});

module.exports = router;

