require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const router = express.Router();
const FRONT_DOMAIN = process.env.FRONT_DOMAIN;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN;
const Payment = require("../../models/paymentModels");

// Redirige al dominio frontal
router.get('/', (req, res) => {
  try {
    res.redirect(FRONT_DOMAIN + req.originalUrl);
  } catch (error) {
    console.error("Error en la redirección:", error);
    res.status(500).json({ message: "Error al redirigir al dominio frontal" });
  }
});

// Crea una sesión de checkout
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, quantity, userId } = req.body;

    // Crear sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: "Pastel",
              
            },
            unit_amount: (amount *100), // Aquí utilizas `unit_amount` en lugar de `amount`
          },
          quantity: quantity, // Aquí `quantity` es un parámetro válido para `line_items`
        },
      ],
      mode: 'payment',
      
      return_url: `${FRONT_DOMAIN}/enduser/return?session_id={CHECKOUT_SESSION_ID}`,
    //  cancel_url: `${FRONT_DOMAIN}/cancel`,
    });

    // Guardar la sesión en la base de datos
    await Payment.create({
      Items: quantity,
      amount: amount,
      status: 'Pendiente', // O 'No aprobado' como valor por defecto
      userId: userId, // Guardar el userId, si es necesario
    });

    res.send({ clientSecret: session.client_secret });
  } catch (error) {
    console.error("Error al crear la sesión de checkout:", error);
    res.status(500).json({ message: "Error al crear la sesión de checkout" });
  }
});

// Obtiene el estado de la sesión
router.get('/session-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    // Actualizar el estado de la sesión en la base de datos
    await Payment.updateOne(
      { /* Aquí debes identificar el registro basado en session_id si lo has guardado antes */ },
      { $set: { status: session.status } }
    );

    res.send({
      status: session.status,
      customer_email: session.customer_details.email
    });
  } catch (error) {
    console.error("Error al obtener el estado de la sesión:", error);
    res.status(500).json({ message: "Error al obtener el estado de la sesión" });
  }
});

module.exports = router;