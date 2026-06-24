const STRIPE_PRICE_BASIC = process.env.STRIPE_PRICE_BASIC;
const STRIPE_PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM;
const STRIPE_PRICE_MAX = process.env.STRIPE_PRICE_MAX;

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    stripe_price_id: null,
    features: [
      'Browse and search',
      '5-minute previews',
      'Standard quality (720p)',
      '1 device',
      'Ads supported',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 7.99,
    currency: 'USD',
    interval: 'month',
    stripe_price_id: STRIPE_PRICE_BASIC || '',
    features: [
      'Unlimited streaming',
      '1080p Full HD',
      '1 simultaneous device',
      'Ad-free',
      'Watch history sync',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 14.99,
    currency: 'USD',
    interval: 'month',
    stripe_price_id: STRIPE_PRICE_PREMIUM || '',
    features: [
      'Everything in Basic',
      '4K Ultra HD + HDR',
      '4 simultaneous devices',
      'Early access to new releases',
      'Download for offline',
      'Priority support',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    price: 24.99,
    currency: 'USD',
    interval: 'month',
    stripe_price_id: STRIPE_PRICE_MAX || '',
    features: [
      'Everything in Premium',
      '10 simultaneous devices',
      'Exclusive content',
      'Family sharing (5 accounts)',
      'Highest bitrate streams',
      '24/7 priority support',
    ],
  },
];

function getPlan(planId) {
  return plans.find((p) => p.id === planId) || null;
}

function getFeaturesForPlan(planId) {
  const plan = getPlan(planId);
  return plan ? plan.features : plans[0].features;
}

function getMaxQuality(planId) {
  switch (planId) {
    case 'max':
    case 'premium':
      return '4k';
    case 'basic':
      return '1080p';
    default:
      return '720p';
  }
}

function getMaxDevices(planId) {
  switch (planId) {
    case 'max': return 10;
    case 'premium': return 4;
    case 'basic': return 1;
    default: return 1;
  }
}

module.exports = { plans, getPlan, getFeaturesForPlan, getMaxQuality, getMaxDevices };
