/**
 * Server-side animation bridge utilities
 */

/**
 * Get device capabilities for adaptive animations
 * @param {object} headers - Request headers
 * @returns {object}
 */
function getDeviceCapabilities(headers = {}) {
  const userAgent = headers['user-agent'] || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  return {
    screenWidth: parseInt(headers['x-screen-width'] || '1920', 10),
    screenHeight: parseInt(headers['x-screen-height'] || '1080', 10),
    maxFps: isMobile ? 30 : 60,
    browser: userAgent
  };
}

/**
 * Get user profile for animation preferences
 * @param {string} userId - User ID
 * @param {object} db - Database connection
 * @returns {object}
 */
function getUserProfile(userId = 'guest', db = null) {
  // Default profile
  return {
    animationLevel: 'balanced',
    hapticFeedback: false,
    cognitiveLoad: 'medium'
  };
}

/**
 * Get content context for animation preferences
 * @param {string} page - Current page
 * @param {string} genre - Genre from context
 * @returns {object}
 */
function getContentContext(page = 'browse', genre = 'general') {
  return {
    genre: genre.toLowerCase(),
    contentType: page.includes('player') ? 'video' : 'browse',
    maturityRating: 'general'
  };
}

/**
 * Get time of day
 * @param {Date} date - Date object
 * @returns {string}
 */
function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Build animation request
 * @param {object} req - HTTP request
 * @param {object} db - Database connection
 * @returns {object}
 */
function buildAnimationRequest(req = {}, db = null) {
  const userId = req.body?.userId || req.cookies?.ps_user_id || 'guest';

  return {
    userId,
    deviceCapabilities: getDeviceCapabilities(req.headers),
    contentContext: getContentContext(req.body?.page, req.body?.genre),
    timeOfDay: getTimeOfDay(),
    userProfile: getUserProfile(userId, db)
  };
}

module.exports = {
  getDeviceCapabilities,
  getUserProfile,
  getContentContext,
  getTimeOfDay,
  buildAnimationRequest
};