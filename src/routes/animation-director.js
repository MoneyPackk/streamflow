const express = require('express');
const { getAnimationConfig } = require('../animation-director');

const router = express.Router();

/**
 * Animation Director Endpoint
 *
 * Accepts animation configuration requests and returns CSS variable overrides
 * Adaptive based on user, device, content, and time of day
 */
router.post('/', async (req, res) => {
  try {
    const request = {
      userId: req.body.userId || req.cookies?.ps_user_id || 'guest',
      deviceCapabilities: {
        screenWidth: parseInt(req.headers['x-screen-width'] || '1920', 10),
        screenHeight: parseInt(req.headers['x-screen-height'] || '1080', 10),
        maxFps: parseInt(req.headers['x-fps'] || '60', 10),
        browser: req.headers['user-agent'] || ''
      },
      contentContext: {
        genre: req.body.genre || req.body.type || 'general',
        contentType: req.body.contentType || 'browse',
        maturityRating: req.body.maturity || 'general'
      },
      timeOfDay: req.body.timeOfDay || new Date().getHours() < 12 ? 'morning' :
                new Date().getHours() < 17 ? 'afternoon' :
                new Date().getHours() < 21 ? 'evening' : 'night',
      userProfile: {
        animationLevel: req.body.animationLevel || 'balanced',
        hapticFeedback: req.body.hapticFeedback || false,
        cognitiveLoad: req.body.cognitiveLoad || 'medium'
      }
    };

    // Generate animation configuration using the Animation Director module
    const animationConfig = await getAnimationConfig(request);

    res.json(animationConfig);
  } catch (error) {
    console.error('Animation Director Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
      fallback: true
    });
  }
});

/**
 * Health Check Endpoint
 * Used by monitoring systems to verify the service is running
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Animation Director',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;