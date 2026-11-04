/**
 * Global Performance Optimization
 * System-wide performance enhancements for faster app loading
 */

import { debounce, throttle } from './performanceOptimization';

/**
 * Initialize all global optimizations
 */
export function initializeGlobalOptimizations() {
  optimizeNetworkRequests();
  optimizeDOMRendering();
  optimizeResourceLoading();
  optimizeEventHandlers();
  setupPerformanceMonitoring();
  enableNetworkInformation();
}

/**
 * Network request optimization
 */
function optimizeNetworkRequests() {
  // Enable HTTP/2 Server Push hints
  const head = document.head;
  const resources = [
    {
      rel: 'preconnect',
      href: 'https://api.supabase.co',
    },
    {
      rel: 'dns-prefetch',
      href: 'https://api.supabase.co',
    },
  ];

  resources.forEach((resource) => {
    const link = document.createElement('link');
    link.rel = resource.rel;
    link.href = resource.href;
    if (resource.rel === 'preconnect') {
      link.crossOrigin = 'anonymous';
    }
    head.appendChild(link);
  });

  // Optimize fetch requests
  const originalFetch = window.fetch;
  const requestCache = new Map<string, { data: any; timestamp: number }>();
  const cacheTTL = 5 * 60 * 1000; // 5 minutes

  window.fetch = function (...args: any[]) {
    const url = args[0];
    const options = args[1] || {};

    // Don't cache non-GET requests or mutations
    if (options.method && options.method !== 'GET') {
      return originalFetch.apply(this, args);
    }

    // Check cache for GET requests
    const now = Date.now();
    if (requestCache.has(url)) {
      const cached = requestCache.get(url)!;
      if (now - cached.timestamp < cacheTTL) {
        return Promise.resolve(
          new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      requestCache.delete(url);
    }

    // Make actual request
    return originalFetch
      .apply(this, args)
      .then((response) => {
        // Cache successful GET responses
        if (response.ok && options.method !== 'POST' && options.method !== 'PUT') {
          response
            .clone()
            .json()
            .then((data) => {
              requestCache.set(url, { data, timestamp: now });
            })
            .catch(() => {
              // Ignore cache errors
            });
        }
        return response;
      });
  } as any;
}

/**
 * DOM rendering optimization
 */
function optimizeDOMRendering() {
  // Defer non-critical DOM updates
  const observer = new MutationObserver((mutations) => {
    requestAnimationFrame(() => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Batch DOM updates
          const fragment = document.createDocumentFragment();
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              fragment.appendChild(node.cloneNode(true));
            }
          });
        }
      });
    });
  });

  // Observe main app container
  const appRoot = document.getElementById('root') || document.body;
  observer.observe(appRoot, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // Enable containment on major containers
  const containers = document.querySelectorAll('[data-container="true"]');
  containers.forEach((container) => {
    (container as HTMLElement).style.contain = 'layout style paint';
  });
}

/**
 * Resource loading optimization
 */
function optimizeResourceLoading() {
  // Preload critical resources
  const criticalResources = [
    { rel: 'preload', href: '/branding/kilax-icon.svg', as: 'image' },
  ];

  criticalResources.forEach((resource) => {
    const link = document.createElement('link');
    link.rel = resource.rel;
    link.href = resource.href;
    if (resource.as) link.as = resource.as;
    document.head.appendChild(link);
  });

  // Lazy load non-critical images
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
          imageObserver.unobserve(img);
        }
      });
    });

    document.querySelectorAll('[data-src]').forEach((img) => {
      imageObserver.observe(img);
    });
  }

  // Optimize font loading
  if ('fonts' in document) {
    (document as any).fonts.ready.then(() => {
      document.documentElement.classList.add('fonts-loaded');
    });
  }
}

/**
 * Event handler optimization
 */
function optimizeEventHandlers() {
  // Throttle scroll events
  const scrollHandler = throttle(() => {
    document.dispatchEvent(new CustomEvent('optimized-scroll'));
  }, 16); // ~60fps

  window.addEventListener('scroll', scrollHandler, { passive: true });

  // Throttle resize events
  const resizeHandler = throttle(() => {
    document.dispatchEvent(new CustomEvent('optimized-resize'));
  }, 100);

  window.addEventListener('resize', resizeHandler, { passive: true });

  // Debounce input events
  document.addEventListener(
    'input',
    debounce((event: any) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        event.target.dispatchEvent(new CustomEvent('debounced-input'));
      }
    }, 200),
    true,
  );
}

/**
 * Performance monitoring
 */
function setupPerformanceMonitoring() {
  if (!('PerformanceObserver' in window)) return;

  // Monitor First Contentful Paint
  const fcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log('[FCP]', (entry as any).startTime.toFixed(2) + 'ms');
    }
  });

  try {
    fcpObserver.observe({ entryTypes: ['paint'] });
  } catch {
    // FCP not supported
  }

  // Monitor Largest Contentful Paint
  const lcpObserver = new PerformanceObserver((list) => {
    const lastEntry = list.getEntries()[list.getEntries().length - 1];
    console.log('[LCP]', (lastEntry as any).renderTime.toFixed(2) + 'ms');
  });

  try {
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch {
    // LCP not supported
  }

  // Monitor Cumulative Layout Shift
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const entryAny = entry as any;
      if (!entryAny.hadRecentInput) {
        clsValue += entryAny.value;
        console.log('[CLS]', clsValue.toFixed(3));
      }
    }
  });

  try {
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  } catch {
    // CLS not supported
  }
}

/**
 * Network information API for adaptive loading
 */
function enableNetworkInformation() {
  if (!('connection' in navigator)) return;

  const connection = (navigator as any).connection;
  const updateNetworkInfo = () => {
    const effectiveType = connection.effectiveType;
    const saveData = connection.saveData;

    // Apply data-saving strategies
    if (saveData) {
      document.documentElement.setAttribute('data-save-data', 'true');
    }

    // Adjust animation speed based on connection
    const animationSpeed = effectiveType === '4g' ? 'normal' : 'reduced';
    document.documentElement.setAttribute('data-animation-speed', animationSpeed);

    // Log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Network]', {
        effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData,
      });
    }
  };

  updateNetworkInfo();
  connection.addEventListener('change', updateNetworkInfo);
}

/**
 * Memory-efficient list rendering
 */
export function optimizeListRendering(items: any[], itemHeight: number) {
  const container = document.querySelector('[data-list-container]');
  if (!container) return;

  const containerHeight = container.clientHeight;
  const scrollTop = container.scrollTop || 0;

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);

  return items.slice(startIndex, endIndex);
}

/**
 * Preload Next.js pages
 */
export function preloadNextPage(route: string) {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = route;
  link.as = 'document';
  document.head.appendChild(link);
}

/**
 * Enable memory profiling in development
 */
export function enableMemoryProfiling() {
  if (process.env.NODE_ENV !== 'development') return;

  if ('memory' in performance) {
    setInterval(() => {
      const memory = (performance as any).memory;
      console.log('[Memory]', {
        usedJSHeapSize: (memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        totalJSHeapSize: (memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB',
      });
    }, 5000);
  }
}

/**
 * Batch API requests to reduce network overhead
 */
export class BatchRequestQueue {
  private queue: Array<{ request: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];
  private processing = false;
  private batchDelay: number;

  constructor(batchDelayMs: number = 50) {
    this.batchDelay = batchDelayMs;
  }

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      if (!this.processing) {
        this.processBatch();
      }
    });
  }

  private async processBatch() {
    this.processing = true;

    await new Promise((resolve) => setTimeout(resolve, this.batchDelay));

    const batch = [...this.queue];
    this.queue = [];

    await Promise.all(
      batch.map(({ request, resolve, reject }) => {
        request().then(resolve).catch(reject);
      }),
    );

    if (this.queue.length > 0) {
      setTimeout(() => this.processBatch(), this.batchDelay);
    } else {
      this.processing = false;
    }
  }
}

export default {
  initializeGlobalOptimizations,
  optimizeListRendering,
  preloadNextPage,
  enableMemoryProfiling,
  BatchRequestQueue,
};
