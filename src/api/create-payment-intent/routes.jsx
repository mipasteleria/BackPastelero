const express = require('express');
const app = express();
const stripe = require('stripe')('your-stripe-secret-key');

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'mxn',
        product_data: {
          name: 'Stubborn Attachments',
        },
        unit_amount: 2000,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${req.headers.origin}/?success=true`,
    cancel_url: `${req.headers.origin}/?canceled=true`,
  });

  res.json({ id: session.id });
});

app.listen(4242, () => console.log(`Listening on port 4242!`));
