/**
 * Performance Optimization Utilities
 * Helps improve app loading speed and responsiveness
 */

// Debounce function for high-frequency operations
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function for animation frames and scroll events
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// RequestAnimationFrame throttle for smooth animations
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T,
): (...args: Parameters<T>) => void {
  let ticking = false;
  return function executedFunction(...args: Parameters<T>) {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        func(...args);
        ticking = false;
      });
    }
  };
}

// Lazy load images with intersection observer
export function lazyLoadImage(element: HTMLImageElement) {
  if (!('IntersectionObserver' in window)) {
    // Fallback for older browsers
    element.src = element.dataset.src || '';
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          img.src = img.dataset.src || '';
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    },
    {
      rootMargin: '50px',
    },
  );

  observer.observe(element);
}

// Preload critical data with fetch priority
export async function preloadData(
  url: string,
  options?: RequestInit & { priority?: 'high' | 'low' | 'auto' },
) {
  try {
    const init: RequestInit = {
      method: 'GET',
      ...options,
    };

    // Use fetch with priority hint if available
    if ('priority' in options!) {
      (init as any).priority = options.priority;
    }

    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`Failed to preload ${url}`);
    return response;
  } catch (error) {
    console.warn(`Failed to preload data from ${url}:`, error);
  }
}

// Batch updates for state management
export function batchStateUpdates<T>(updates: T, delay: number = 0): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(updates);
    }, delay);
  });
}

// Memory-efficient list virtualization helper
export function calculateVisibleRange(
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
): { start: number; end: number } {
  const start = Math.floor(scrollTop / itemHeight);
  const end = Math.ceil((scrollTop + containerHeight) / itemHeight);
  return { start, end };
}

// Optimize route transitions
export function prefetchRoute(routePath: string) {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = routePath;
  link.as = 'document';
  document.head.appendChild(link);
}

// Service worker registration for offline support
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    try {
      await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });
      console.log('Service Worker registered');
    } catch (error) {
      console.warn('Service Worker registration failed:', error);
    }
  }
}

// Measure Core Web Vitals
export function measureWebVitals() {
  if ('PerformanceObserver' in window) {
    try {
      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (process.env.NODE_ENV === 'development') {
          console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('FID:', entry.processingDuration);
          }
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            if (process.env.NODE_ENV === 'development') {
              console.log('CLS:', clsValue);
            }
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.warn('Web Vitals measurement failed:', error);
    }
  }
}

// Cache API responses locally
export class ResponseCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttl = ttlMs;
  }

  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear() {
    this.cache.clear();
  }
}
