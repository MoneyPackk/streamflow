import { getTheme } from './storage.js';

/**
 * Animation Bridge - Frontend integration for AI-powered animation configuration
 *
 * This module bridges the frontend UI components with the LangChain Animation Director endpoint.
 * It manages animation state, fetches AI-generated configurations, and applies them as CSS variables.
 *
 * @module animation-bridge
 * @requires window.fetch
 * @requires window.localStorage
 */

/**
 * @typedef {Object} AnimationConfig
 * @property {string} peacockSpeed - Duration of peacock animation cycle
 * @property {number} glowIntensity - Glow intensity in pixels
 * @property {number} particleCount - Number of particles to emit on hover
 * @property {string} hoverLift - Hover lift amount
 * @property {string} animationDuration - Duration of animation transitions
 * @property {string} colorVibrancy - Color vibrancy level
 * @property {number} responsiveScale - Scale factor for responsive devices
 * @property {string} performanceMode - Performance mode indicator
 * @property {string} accentPrimary - Primary accent color
 * @property {string} animationIntensity - Animation intensity level
 * @property {string} backgroundIntensity - Background intensity level
 * @property {string} glowMultiplier - Glow multiplier
 */

/**
 * @typedef {Object} DeviceCapabilities
 * @property {number} screenWidth - Screen width in pixels
 * @property {number} screenHeight - Screen height in pixels
 * @property {number} maxFps - Maximum frame rate
 * @property {string} browser - Browser name
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} animationLevel - Animation level preference
 * @property {boolean} hapticFeedback - Whether haptic feedback is enabled
 * @property {string} cognitiveLoad - Cognitive load level
 */

/**
 * @typedef {Object} ContentContext
 * @property {string} genre - Content genre
 * @property {string} contentType - Content type
 * @property {string} maturityRating - Maturity rating
 */

/**
 * @typedef {Object} AnimationRequest
 * @property {string} userId - User identifier
 * @property {DeviceCapabilities} deviceCapabilities - Device capabilities
 * @property {ContentContext} contentContext - Content context
 * @property {string} timeOfDay - Time of day
 * @property {UserProfile} userProfile - User profile
 */

/**
 * Get device capabilities for adaptive animations
 * @returns {DeviceCapabilities}
 */
function getDeviceCapabilities() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return {
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    maxFps: isMobile ? 30 : 60,
    browser: navigator.userAgent.split(' ').pop()?.replace(/[()]/g, '') || 'unknown'
  };
}

/**
 * Get user profile for animation preferences
 * @returns {UserProfile}
 */
function getUserProfile() {
  const storedProfile = localStorage.getItem('ps_animation_profile');

  if (storedProfile) {
    try {
      return JSON.parse(storedProfile);
    } catch (error) {
      // Fallback to default profile if stored profile is invalid
    }
  }

  return {
    animationLevel: 'balanced',
    hapticFeedback: false,
    cognitiveLoad: 'medium'
  };
}

/**
 * Get content context for animation preferences
 * @returns {ContentContext}
 */
function getContentContext() {
  const currentPage = document.querySelector('.page.active')?.id || 'page-browse';
  const pageTitle = document.querySelector('.page.active .hero-title')?.textContent || 'browse';

  return {
    genre: pageTitle.toLowerCase(),
    contentType: currentPage.includes('player') ? 'video' : 'browse',
    maturityRating: 'general'
  };
}

/**
 * Get time of day
 * @returns {string}
 */
function getTimeOfDay() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Build animation request
 * @returns {AnimationRequest}
 */
function buildAnimationRequest() {
  return {
    userId: localStorage.getItem('ps_user_id') || 'guest',
    deviceCapabilities: getDeviceCapabilities(),
    contentContext: getContentContext(),
    timeOfDay: getTimeOfDay(),
    userProfile: getUserProfile()
  };
}

/**
 * Apply animation configuration to CSS variables
 * @param {AnimationConfig} config - Animation configuration
 */
function applyAnimationConfig(config) {
  Object.entries(config).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
}

/**
 * Fetch AI-generated animation configuration
 * @returns {Promise<AnimationConfig>}
 */
async function fetchAnimationConfig() {
  try {
    const response = await fetch('/api/animation-director', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildAnimationRequest())
    });

    if (!response.ok) {
      throw new Error(`Animation API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch animation config:', error);
    return null;
  }
}

/**
 * Initialize animation bridge
 */
export function initAnimationBridge() {
  // Apply default configuration
  const defaultConfig = {
    '--peacock-speed': '8s',
    '--glow-intensity': '20px',
    '--particle-count': '15',
    '--hover-lift': '-12px',
    '--animation-duration': '0.5s',
    '--color-vibrancy': 'normal',
    '--responsive-scale': '1.0',
    '--performance-mode': 'enhanced',
    '--accent-primary': 'rgba(34, 211, 238, 0.8)',
    '--animation-intensity': 'balanced',
    '--background-intensity': 'normal',
    '--glow-multiplier': '1.0'
  };

  Object.entries(defaultConfig).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });

  // Listen for page changes
  document.addEventListener('page-change', () => {
    fetchAnimationConfig().then(config => {
      if (config) applyAnimationConfig(config);
    });
  });

  // Listen for theme changes
  window.addEventListener('theme-change', () => {
    fetchAnimationConfig().then(config => {
      if (config) applyAnimationConfig(config);
    });
  });

  // Periodically refresh animation config
  setInterval(() => {
    fetchAnimationConfig().then(config => {
      if (config) applyAnimationConfig(config);
    });
  }, 300000); // 5 minutes

  // Initial fetch
  fetchAnimationConfig().then(config => {
    if (config) applyAnimationConfig(config);
  });
}

// Export utilities for testing
export {
  getDeviceCapabilities,
  getUserProfile,
  getContentContext,
  getTimeOfDay,
  buildAnimationRequest,
  applyAnimationConfig,
  fetchAnimationConfig
};
