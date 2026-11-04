/**
 * Global Animation Configuration
 * Centralized settings for all animations and transitions
 */

export const ANIMATION_CONFIG = {
  // Duration values (in milliseconds)
  durations: {
    instant: 0,
    fast: 150,
    base: 200,
    moderate: 300,
    slow: 400,
    slower: 500,
    slowest: 600,
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeInQuad: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
    easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    easeInQuart: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
    easeOutQuart: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  },

  // Page transition animations
  pageTransitions: {
    fadeIn: {
      duration: 300,
      easing: 'ease-in-out',
      class: 'fade-in',
    },
    slideInUp: {
      duration: 400,
      easing: 'ease-out',
      class: 'slide-up',
    },
    slideInLeft: {
      duration: 350,
      easing: 'ease-out',
      class: 'slide-left',
    },
    slideInRight: {
      duration: 350,
      easing: 'ease-out',
      class: 'slide-right',
    },
  },

  // Component animations
  components: {
    button: {
      hover: { duration: 200, easing: 'ease-out' },
      active: { duration: 100, easing: 'ease-out' },
    },
    modal: {
      enter: { duration: 300, easing: 'ease-out' },
      exit: { duration: 200, easing: 'ease-in' },
    },
    sidebar: {
      open: { duration: 300, easing: 'ease-out' },
      close: { duration: 250, easing: 'ease-in' },
    },
    tooltip: {
      show: { duration: 150, easing: 'ease-out' },
      hide: { duration: 100, easing: 'ease-in' },
    },
  },

  // Performance-related settings
  performance: {
    // Debounce delays (in milliseconds)
    debounce: {
      search: 300,
      filter: 250,
      resize: 150,
      scroll: 100,
    },

    // Throttle intervals (in milliseconds)
    throttle: {
      scroll: 16, // ~60fps
      resize: 100,
      input: 50,
    },

    // Cache TTL (time to live)
    cache: {
      short: 1 * 60 * 1000, // 1 minute
      medium: 5 * 60 * 1000, // 5 minutes
      long: 30 * 60 * 1000, // 30 minutes
      day: 24 * 60 * 60 * 1000, // 1 day
    },

    // Loading states
    skeletonDelay: 200, // Show skeleton after 200ms
  },

  // Responsive breakpoints (match Tailwind)
  breakpoints: {
    xs: 0,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },

  // Z-index layers
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    backdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
};

/**
 * Get animation CSS string
 * @example
 * getAnimationCSS('fadeIn') => 'opacity 0.3s ease-in-out'
 */
export function getAnimationCSS(
  animationType: keyof typeof ANIMATION_CONFIG.pageTransitions,
) {
  const config = ANIMATION_CONFIG.pageTransitions[animationType];
  if (!config) return '';
  return `${config.duration}ms ${config.easing}`;
}

/**
 * Get transition CSS
 * @example
 * getTransitionCSS('all', 'moderate') => 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
 */
export function getTransitionCSS(
  property: string,
  duration: keyof typeof ANIMATION_CONFIG.durations = 'base',
  easing: keyof typeof ANIMATION_CONFIG.easing = 'easeInOut',
) {
  const dur = ANIMATION_CONFIG.durations[duration];
  const ease = ANIMATION_CONFIG.easing[easing];
  return `${property} ${dur}ms ${ease}`;
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation settings based on user preference
 */
export function getAnimationSettings(
  defaultAnimation: keyof typeof ANIMATION_CONFIG.pageTransitions,
): keyof typeof ANIMATION_CONFIG.pageTransitions {
  if (prefersReducedMotion()) {
    return 'fadeIn'; // Fallback to instant fade
  }
  return defaultAnimation;
}

/**
 * Apply animation with accessibility consideration
 */
export function getAnimationClass(
  animation: keyof typeof ANIMATION_CONFIG.pageTransitions,
): string {
  if (prefersReducedMotion()) {
    return 'fade-in'; // Instant, no motion
  }
  return ANIMATION_CONFIG.pageTransitions[animation].class;
}

export default ANIMATION_CONFIG;
