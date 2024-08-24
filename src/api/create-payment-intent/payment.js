const stripe = require('stripe')('sk_test_51PpLMA05NkS1u2DAL89pnKJxgtDJpGlmwUaUSqST9hiLtVtUv0wDVTHKVuZOpcvKCg813LZlKO7oXQMmjir8Bzki00Ue2ALaVY');
const express = require('express');
const app = express();
app.use(express.static('public'));

const YOUR_DOMAIN = 'http://localhost:3000;'

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        // Proporciona el ID de precio exacto del producto que quieres vender
        price: '{{PRICE_ID}}',
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${YOUR_DOMAIN}?success=true`,
    cancel_url: `${YOUR_DOMAIN}?canceled=true`,
  });

  res.redirect(303, session.url);
});

app.listen(4242, () => console.log('Running on port 4242'));
