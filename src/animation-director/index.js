"use strict";

/**
 * Animation Director - Pure JavaScript implementation
 * No external dependencies, generates adaptive CSS variables for animations
 */

const moods = {
  'action': { energy: 'high', intensity: 'dramatic', style: 'dynamic', colors: 'vibrant' },
  'romance': { energy: 'low', intensity: 'subtle', style: 'smooth', colors: 'warm' },
  'horror': { energy: 'very high', intensity: 'intense', style: 'shocking', colors: 'contrast' },
  'comedy': { energy: 'high', intensity: 'playful', style: 'bouncy', colors: 'bright' },
  'thriller': { energy: 'very high', intensity: 'suspense', style: 'sharp', colors: 'dramatic' },
  'documentary': { energy: 'low', intensity: 'calm', style: 'soft', colors: 'neutral' },
  'fantasy': { energy: 'high', intensity: 'magical', style: 'ethereal', colors: 'magical' },
  'science-fiction': { energy: 'medium', intensity: 'futuristic', style: 'techy', colors: 'cool' }
};

function getAnimationPreferences(userId, deviceCapabilities, contentContext, timeOfDay, userProfile) {
  return {
    userId,
    deviceCapabilities,
    contentContext,
    timeOfDay,
    userProfile
  };
}

function analyzeContentMood(genre) {
  return moods[genre.toLowerCase()] || { energy: 'medium', intensity: 'balanced', style: 'neutral', colors: 'standard' };
}

function generateCustomStylesheet(preferences, contentMood, deviceCapabilities, timeOfDay, userId) {
  const style = {
    '--peacock-speed': preferences?.speed || '8s',
    '--glow-intensity': preferences?.intensity || '20px',
    '--particle-count': preferences?.particles || '15',
    '--hover-lift': preferences?.lift || '-12px',
    '--animation-duration': preferences?.duration || '0.5s',
    '--color-vibrancy': preferences?.vibrancy || 'normal',
    '--responsive-scale': deviceCapabilities?.screenWidth < 768 ? '0.8' : '1.0',
    '--performance-mode': deviceCapabilities?.maxFps < 60 ? 'optimized' : 'enhanced'
  };

  if (contentMood.style === 'dynamic') {
    style['--accent-primary'] = 'hsla(0, 100%, 50%, 0.8)';
    style['--animation-intensity'] = 'dynamic';
  } else if (contentMood.style === 'smooth') {
    style['--accent-primary'] = 'hsla(340, 80%, 60%, 0.6)';
    style['--animation-intensity'] = 'subtle';
  }

  if (timeOfDay === 'night' || timeOfDay === 'evening') {
    style['--background-intensity'] = 'increased';
    style['--glow-multiplier'] = '1.2';
  }

  return style;
}

function updateDeviceAdaptiveSettings(deviceCapabilities) {
  const adaptive = {
    lowEnd: {
      animationComplexity: 'minimal',
      particleEffect: 'false',
      backgroundType: 'static',
      performanceBudget: '60fps'
    },
    midRange: {
      animationComplexity: 'balanced',
      particleEffect: 'moderate',
      backgroundType: 'enhanced',
      performanceBudget: '90fps'
    },
    highEnd: {
      animationComplexity: 'enhanced',
      particleEffect: 'full',
      backgroundType: 'dynamic',
      performanceBudget: '120fps'
    }
  };

  const screenWidth = deviceCapabilities?.screenWidth || 1920;
  const performance = screenWidth < 1200 ? 'midRange' : 'highEnd';

  return adaptive[performance];
}

/**
 * Main animation director function - generates complete animation config
 */
async function getAnimationConfig(request) {
  const { userId, deviceCapabilities, contentContext, timeOfDay, userProfile } = request;

  const preferences = getAnimationPreferences(userId, deviceCapabilities, contentContext, timeOfDay, userProfile);
  const contentMood = analyzeContentMood(contentContext?.genre || 'general');
  const stylesheet = generateCustomStylesheet(preferences, contentMood, deviceCapabilities, timeOfDay, userId);
  const adaptiveSettings = updateDeviceAdaptiveSettings(deviceCapabilities);

  return {
    success: true,
    preferences: { ...preferences, animationLevel: userProfile?.animationLevel || 'balanced' },
    contentMood,
    stylesheet,
    adaptiveSettings,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getAnimationConfig,
  getAnimationPreferences,
  analyzeContentMood,
  generateCustomStylesheet,
  updateDeviceAdaptiveSettings
};