/**
 * Layout Optimization Utilities
 * Prevents layout shifts (CLS) and optimizes rendering performance
 */

// Container queries for responsive optimization
export const setupContainerQueries = () => {
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    @supports (container-type: inline-size) {
      .container-optimized {
        container-type: inline-size;
      }

      @container (max-width: 480px) {
        .col-mobile { display: block; }
        .col-tablet { display: none; }
      }

      @container (min-width: 481px) and (max-width: 768px) {
        .col-mobile { display: none; }
        .col-tablet { display: block; }
      }

      @container (min-width: 769px) {
        .col-mobile { display: none; }
        .col-desktop { display: block; }
      }
    }
  `;
  document.head.appendChild(style);
};

// Prevent cumulative layout shift (CLS)
export class LayoutShiftPrevention {
  private reservedSpace = new Map<string, number>();

  /**
   * Reserve space for content that loads asynchronously
   * Prevents layout shift when content appears
   */
  reserve(elementId: string, height: number) {
    this.reservedSpace.set(elementId, height);
    const element = document.getElementById(elementId);
    if (element) {
      element.style.minHeight = `${height}px`;
    }
  }

  /**
   * Release reserved space once content is loaded
   */
  release(elementId: string) {
    this.reservedSpace.delete(elementId);
    const element = document.getElementById(elementId);
    if (element) {
      element.style.minHeight = 'auto';
    }
  }

  /**
   * Clear all reservations
   */
  clear() {
    this.reservedSpace.forEach((_, elementId) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.minHeight = 'auto';
      }
    });
    this.reservedSpace.clear();
  }
}

// Font optimization to prevent layout shift from font loading
export const optimizeFontLoading = () => {
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'DM Sans';
      font-style: normal;
      font-weight: 400;
      font-display: swap; /* Prevent font swap delay */
      src: url('https://fonts.gstatic.com/s/dmsans/v11/rkelm-kS6g0Qww5l.woff2') format('woff2');
    }

    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEnyS4ChV-QFS5OWlxY.woff2') format('woff2');
    }

    /* Prevent shift from font loading */
    html {
      font-family: system-ui, -apple-system, sans-serif;
    }

    body {
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
    }
  `;
  document.head.appendChild(style);
};

// Virtual scrolling for large lists
export interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export class VirtualScroller {
  private itemHeight: number;
  private containerHeight: number;
  private overscan: number;
  private scrollTop = 0;

  constructor(options: VirtualScrollOptions) {
    this.itemHeight = options.itemHeight;
    this.containerHeight = options.containerHeight;
    this.overscan = options.overscan ?? 3;
  }

  updateScroll(scrollTop: number) {
    this.scrollTop = scrollTop;
  }

  getVisibleRange(totalItems: number) {
    const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.overscan);
    const end = Math.min(
      totalItems,
      Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + this.overscan,
    );
    return { start, end, offset: start * this.itemHeight };
  }

  getTotalHeight(totalItems: number) {
    return totalItems * this.itemHeight;
  }
}

// Optimize images for different screen sizes
export interface ResponsiveImageOptions {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcSet?: string;
  sizes?: string;
}

export function createResponsiveImage(options: ResponsiveImageOptions) {
  const img = document.createElement('img');
  img.src = options.src;
  img.alt = options.alt;

  if (options.width) img.width = options.width;
  if (options.height) img.height = options.height;
  if (options.srcSet) img.srcSet = options.srcSet;
  if (options.sizes) img.sizes = options.sizes;

  // Add loading="lazy" for native lazy loading
  img.loading = 'lazy';

  // Add decoding="async" for non-blocking decoding
  img.decoding = 'async';

  return img;
}

// Batch DOM updates to prevent thrashing
export class DOMBatcher {
  private updates: Array<() => void> = [];
  private scheduled = false;

  schedule(update: () => void) {
    this.updates.push(update);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  flush() {
    this.updates.forEach((update) => update());
    this.updates = [];
    this.scheduled = false;
  }

  clear() {
    this.updates = [];
    this.scheduled = false;
  }
}

// Optimize scrollbar to prevent layout shift
export const hideScrollbarDuringResize = () => {
  if (typeof document === 'undefined') return;

  let resizeTimeout: NodeJS.Timeout;

  const handleResize = () => {
    document.body.style.overflow = 'hidden';
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      document.body.style.overflow = '';
    }, 300);
  };

  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimeout);
  };
};

// Precompute critical styles
export const precomputeCriticalStyles = () => {
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    /* Critical rendering path optimization */
    .critical {
      contain: layout style;
    }

    /* Reduce paint areas */
    .painted {
      will-change: transform;
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    /* Optimize table layouts */
    table {
      table-layout: fixed;
      width: 100%;
    }

    /* Prevent reflow on content changes */
    .fixed-height {
      contain: strict;
    }
  `;
  document.head.appendChild(style);
};

// Monitor and report layout shifts
export class LayoutShiftMonitor {
  private cls = 0;
  private observer: PerformanceObserver | null = null;

  start(callback?: (cls: number) => void) {
    if (!('PerformanceObserver' in window)) return;

    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          const firstSessionEntry = (entry as any);
          this.cls += firstSessionEntry.value;
          if (process.env.NODE_ENV === 'development') {
            console.log('[CLS]', this.cls);
          }
          if (callback) {
            callback(this.cls);
          }
        }
      }
    });

    this.observer.observe({ entryTypes: ['layout-shift'] });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  getCLS(): number {
    return this.cls;
  }
}

export default {
  LayoutShiftPrevention,
  VirtualScroller,
  DOMBatcher,
  LayoutShiftMonitor,
  setupContainerQueries,
  optimizeFontLoading,
  createResponsiveImage,
  hideScrollbarDuringResize,
  precomputeCriticalStyles,
};
