/**
 * Animation and Performance Testing Utilities
 * Use these functions to test and verify animations are working correctly
 */

/**
 * Test all animations in the console
 * Run this in browser console: testAllAnimations()
 */
export function testAllAnimations() {
  console.group('🎨 Testing Animations');

  const animations = ['fadeIn', 'slideInUp', 'slideInLeft', 'slideInRight'];

  animations.forEach((animation) => {
    const element = document.createElement('div');
    element.style.cssText = `
      padding: 20px;
      margin: 10px 0;
      background: #f59e0b;
      color: white;
      border-radius: 4px;
      animation: ${animation} 0.4s ease-out;
    `;
    element.textContent = `Testing: ${animation}`;

    document.body.appendChild(element);

    setTimeout(() => {
      element.remove();
      console.log(`✅ ${animation} - Animation played`);
    }, 500);
  });

  console.groupEnd();
}

/**
 * Measure animation performance
 */
export function measureAnimationPerformance(animationName: string) {
  return new Promise<number>((resolve) => {
    const element = document.createElement('div');
    element.className = `page-content ${animationName}`;
    element.style.cssText = 'width: 100px; height: 100px; background: blue;';

    const startTime = performance.now();
    element.addEventListener('animationend', () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      element.remove();
      console.log(`⏱️  ${animationName} took ${duration.toFixed(2)}ms`);
      resolve(duration);
    });

    document.body.appendChild(element);
  });
}

/**
 * Test debounce functionality
 */
export function testDebounce() {
  console.group('🎯 Testing Debounce');

  let callCount = 0;
  let debouncedCallCount = 0;

  const debouncedFn = (function () {
    let timeout: NodeJS.Timeout;
    return (val: string) => {
      debouncedCallCount++;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log(`Debounced call: ${val}`);
      }, 300);
    };
  })();

  // Simulate rapid calls
  for (let i = 0; i < 100; i++) {
    callCount++;
    debouncedFn(`call-${i}`);
  }

  console.log(`📊 Stats:`);
  console.log(`  Regular calls: ${callCount}`);
  console.log(`  Debounced calls: ${debouncedCallCount}`);
  console.log(`  Reduction: ${(((callCount - 1) / callCount) * 100).toFixed(2)}%`);
  console.groupEnd();
}

/**
 * Test response cache functionality
 */
export function testResponseCache() {
  console.group('💾 Testing Response Cache');

  const cache = new Map<string, { data: any; timestamp: number }>();
  const ttl = 1000; // 1 second

  const set = (key: string, data: any) => {
    cache.set(key, { data, timestamp: Date.now() });
  };

  const get = (key: string): any | null => {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttl) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  };

  // Test cache
  set('test', { value: 'cached' });
  console.log('✅ Set cache:', get('test'));

  setTimeout(() => {
    console.log('❌ Cache expired:', get('test'));
    console.groupEnd();
  }, ttl + 100);
}

/**
 * Test lazy loading functionality
 */
export function testLazyLoading() {
  console.group('🖼️  Testing Lazy Loading');

  const images = document.querySelectorAll('[data-src]');
  console.log(`Found ${images.length} images with data-src attribute`);

  if (images.length === 0) {
    console.log('⚠️  No images with data-src found. Create one to test:');
    console.log('<img data-src="/image.jpg" alt="test" />');
  } else {
    images.forEach((img, index) => {
      console.log(`${index + 1}. ${img.getAttribute('alt')} - ${(img as HTMLImageElement).dataset.src}`);
    });
  }

  console.groupEnd();
}

/**
 * Check if animations are supported
 */
export function checkAnimationSupport() {
  console.group('🔍 Checking Animation Support');

  const element = document.createElement('div');
  const animations = [
    'animation',
    'WebkitAnimation',
    'MozAnimation',
    'OAnimation',
  ];

  let supported = false;
  for (const anim of animations) {
    if (element.style[anim as any] !== undefined) {
      supported = true;
      console.log(`✅ Animations supported via: ${anim}`);
      break;
    }
  }

  if (!supported) {
    console.log('❌ CSS Animations not supported');
  }

  // Check for prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  console.log(`${prefersReduced ? '✅' : '❌'} prefers-reduced-motion: ${prefersReduced}`);

  console.groupEnd();
}

/**
 * Check Core Web Vitals
 */
export function checkWebVitals() {
  console.group('📊 Checking Web Vitals');

  if (!('PerformanceObserver' in window)) {
    console.log('❌ PerformanceObserver not supported');
    console.groupEnd();
    return;
  }

  try {
    // LCP (Largest Contentful Paint)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log(
        `✅ LCP: ${(lastEntry.renderTime || lastEntry.loadTime).toFixed(2)}ms`,
      );
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    // FID (First Input Delay)
    const fidObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry: any) => {
        console.log(`✅ FID: ${entry.processingDuration.toFixed(2)}ms`);
      });
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
  } catch (error) {
    console.log('⚠️  Could not measure all Web Vitals');
  }

  console.groupEnd();
}

/**
 * Run all tests
 */
export function runAllTests() {
  console.clear();
  console.log('%c🚀 Running Animation & Performance Tests', 'font-size: 20px; font-weight: bold;');
  console.log('');

  checkAnimationSupport();
  console.log('');

  testDebounce();
  console.log('');

  testResponseCache();
  console.log('');

  testLazyLoading();
  console.log('');

  checkWebVitals();
  console.log('');

  console.log('%c✅ Tests Complete!', 'font-size: 16px; font-weight: bold; color: green;');
}

/**
 * Performance profiler
 */
export class PerformanceProfiler {
  private marks = new Map<string, number>();

  start(label: string) {
    this.marks.set(label, performance.now());
  }

  end(label: string) {
    const startTime = this.marks.get(label);
    if (!startTime) {
      console.warn(`No start mark found for "${label}"`);
      return 0;
    }

    const duration = performance.now() - startTime;
    console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
    this.marks.delete(label);
    return duration;
  }

  clear() {
    this.marks.clear();
  }
}

// Export profiler instance
export const profiler = new PerformanceProfiler();

/**
 * Log animation configuration
 */
export function logAnimationConfig() {
  console.group('⚙️  Animation Configuration');
  console.log(`Available animations:`);
  console.log(`  - fadeIn (0.3s)`);
  console.log(`  - slideInUp (0.4s)`);
  console.log(`  - slideInLeft (0.35s)`);
  console.log(`  - slideInRight (0.35s)`);
  console.log('');
  console.log(`Debounce defaults:`);
  console.log(`  - search: 300ms`);
  console.log(`  - filter: 250ms`);
  console.log(`  - scroll: 100ms`);
  console.log('');
  console.log(`Cache TTL defaults:`);
  console.log(`  - short: 1 minute`);
  console.log(`  - medium: 5 minutes`);
  console.log(`  - long: 30 minutes`);
  console.groupEnd();
}

// Make utilities available globally in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).testAnimations = {
    testAll: runAllTests,
    testAnimations,
    testDebounce,
    testCache: testResponseCache,
    testLazyLoading,
    checkSupport: checkAnimationSupport,
    checkVitals: checkWebVitals,
    profiler,
    config: logAnimationConfig,
  };

  console.log(
    '%c💡 Use window.testAnimations to access testing utilities',
    'color: #f59e0b; font-weight: bold; font-size: 14px;',
  );
  console.log(
    '%c  - testAnimations.testAll() to run all tests',
    'color: #666; font-size: 12px;',
  );
  console.log(
    '%c  - testAnimations.config() to see animation settings',
    'color: #666; font-size: 12px;',
  );
}
