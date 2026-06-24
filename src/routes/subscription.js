const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');

function subscriptionRoutes(db) {
  const router = express.Router();

  // Stripe instance is created lazily so the app can start even without Stripe configured
  function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    return require('stripe')(key);
  }

  // Create a checkout session for a given plan
  router.post('/checkout', authenticate, async (req, res, next) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const { plan_id, success_url, cancel_url } = req.body;
      if (!plan_id || !success_url || !cancel_url) {
        return res.status(400).json({ error: 'Missing required fields: plan_id, success_url, cancel_url' });
      }

      const { getPlan } = require('../config/pricing');
      const plan = getPlan(plan_id);
      if (!plan || !plan.stripe_price_id) {
        return res.status(400).json({ error: 'Invalid or unsupported plan' });
      }

      // Check if user already has an active subscription
      const existing = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
      if (existing && ['active', 'trialing'].includes(existing.status)) {
        return res.status(400).json({ error: 'You already have an active subscription. Use the billing portal to change plans.' });
      }

      // Find or create Stripe customer
      let customerId;
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (existing?.stripe_customer_id) {
        customerId = existing.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { user_id: String(user.id), username: user.username },
        });
        customerId = customer.id;
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        mode: 'subscription',
        success_url: success_url,
        cancel_url: cancel_url,
        metadata: { user_id: String(req.user.id), plan_id },
      });

      // Save/update customer ID
      if (existing) {
        db.prepare('UPDATE subscriptions SET stripe_customer_id = ? WHERE user_id = ?').run(customerId, req.user.id);
      } else {
        db.prepare('INSERT OR IGNORE INTO subscriptions (user_id, stripe_customer_id, plan_id) VALUES (?, ?, ?)').run(req.user.id, customerId, plan_id);
      }

      res.json({ url: session.url });
    } catch (e) {
      next(e);
    }
  });

  // Create a Stripe Customer Portal session for managing billing
  router.get('/portal', authenticate, async (req, res, next) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
      if (!sub?.stripe_customer_id) {
        return res.status(400).json({ error: 'No subscription found' });
      }

      const returnUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}/account`;
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: returnUrl,
      });

      res.json({ url: session.url });
    } catch (e) {
      next(e);
    }
  });

  // Get current user's subscription status
  router.get('/status', optionalAuth, (req, res) => {
    if (!req.user) return res.json({ plan: 'free', status: 'inactive', features: require('../config/pricing').getFeaturesForPlan('free') });

    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) {
      return res.json({ plan: 'free', status: 'inactive', features: require('../config/pricing').getFeaturesForPlan('free') });
    }

    const { getPlan, getFeaturesForPlan } = require('../config/pricing');
    const plan = getPlan(sub.plan_id);

    res.json({
      plan: sub.plan_id,
      status: sub.status,
      current_period_end: sub.current_period_end,
      canceled_at: sub.canceled_at,
      features: getFeaturesForPlan(sub.plan_id),
      max_quality: plan ? require('../config/pricing').getMaxQuality(sub.plan_id) : '720p',
      max_devices: plan ? require('../config/pricing').getMaxDevices(sub.plan_id) : 1,
    });
  });

  return router;
}

// Webhook router — must be mounted BEFORE express.json() middleware
function webhookRouter(db) {
  const router = express.Router();

  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = (() => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return null;
      return require('stripe')(key);
    })();

    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Stripe] Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = parseInt(session.metadata?.user_id);
          const planId = session.metadata?.plan_id;
          const subscriptionId = session.subscription;
          const customerId = session.customer;

          if (userId && subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            db.prepare(`
              INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end)
              VALUES (?, ?, ?, ?, 'active', ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                stripe_customer_id = excluded.stripe_customer_id,
                stripe_subscription_id = excluded.stripe_subscription_id,
                plan_id = excluded.plan_id,
                status = 'active',
                current_period_start = excluded.current_period_start,
                current_period_end = excluded.current_period_end,
                canceled_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            `).run(
              userId, customerId, subscriptionId, planId || 'basic',
              new Date(subscription.current_period_start * 1000).toISOString(),
              new Date(subscription.current_period_end * 1000).toISOString()
            );
            console.log(`[Stripe] Subscription activated for user ${userId} — ${planId}`);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          const userId = parseInt(subscription.metadata?.user_id) ||
            db.prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?').get(subscription.id)?.user_id;

          if (userId) {
            db.prepare(`
              UPDATE subscriptions SET status = ?, current_period_start = ?, current_period_end = ?, canceled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
            `).run(
              subscription.status,
              new Date(subscription.current_period_start * 1000).toISOString(),
              new Date(subscription.current_period_end * 1000).toISOString(),
              subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
              userId
            );
            console.log(`[Stripe] Subscription updated for user ${userId} — status: ${subscription.status}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const userId = parseInt(subscription.metadata?.user_id) ||
            db.prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?').get(subscription.id)?.user_id;

          if (userId) {
            db.prepare(`
              UPDATE subscriptions SET status = 'canceled', canceled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
            `).run(
              subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : new Date().toISOString(),
              userId
            );
            console.log(`[Stripe] Subscription canceled for user ${userId}`);
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error('[Stripe] Webhook handler error:', e);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  return router;
}

module.exports = subscriptionRoutes;
module.exports.webhookRouter = webhookRouter;
