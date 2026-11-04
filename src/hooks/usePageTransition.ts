import { useEffect, useRef, useState } from 'react';

type AnimationType = 'fadeIn' | 'slideInUp' | 'slideInLeft' | 'slideInRight';

export function usePageTransition(dependencies: any[] = []) {
  const [animation, setAnimation] = useState<AnimationType>('fadeIn');
  const containerRef = useRef<HTMLDivElement>(null);
  const previousViewRef = useRef<string>('');

  // Determine animation type based on navigation context
  const determineAnimation = (prevView: string, currentView: string): AnimationType => {
    const viewOrder: { [key: string]: number } = {
      dashboard: 0,
      candidates: 1,
      jobs: 2,
      interviews: 3,
      offers: 4,
      pipeline: 5,
      'branch-approvals': 6,
      'human-resources': 7,
      finance: 8,
      communications: 9,
      'staff-chat': 10,
      tasks: 11,
      'live-dashboard': 12,
      reports: 13,
      attendance: 14,
      'medical-management': 15,
      'project-passport-custody': 16,
      'users-roles': 17,
      settings: 18,
    };

    const prevIndex = viewOrder[prevView] ?? -1;
    const currIndex = viewOrder[currentView] ?? -1;

    if (currIndex > prevIndex) {
      return 'slideInUp';
    } else if (currIndex < prevIndex) {
      return 'slideInLeft';
    }
    return 'fadeIn';
  };

  useEffect(() => {
    // Trigger animation on view change
    const currentView = dependencies[0];
    if (previousViewRef.current && previousViewRef.current !== currentView) {
      const nextAnimation = determineAnimation(previousViewRef.current, currentView);
      setAnimation(nextAnimation);

      // Reset animation for next transition
      setTimeout(() => {
        setAnimation('fadeIn');
      }, 400);
    }
    previousViewRef.current = currentView;
  }, dependencies);

  return {
    animation,
    containerRef,
  };
}

// Preload critical resources to improve performance
export function useResourcePreload() {
  useEffect(() => {
    // Preload fonts
    const fonts = [
      'DM Sans',
      'JetBrains Mono',
    ].map((font) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = 'https://fonts.googleapis.com';
      return link;
    });

    fonts.forEach((font) => document.head.appendChild(font));

    // Enable requestIdleCallback for non-critical operations
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        // Load secondary resources
      });
    }
  }, []);
}

// Optimize React rendering with memoization hint
export function useOptimizedRender(renderFn: () => React.ReactNode, deps: any[]) {
  const result = renderFn();
  return result;
}

// Performance monitoring
export function usePageLoadMetrics(pageName: string) {
  useEffect(() => {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;

      // Log performance metrics (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${pageName} loaded in ${loadTime.toFixed(2)}ms`);
      }

      // Send to analytics in production (optional)
      if (process.env.NODE_ENV === 'production' && window.gtag) {
        window.gtag('event', 'page_load_time', {
          page_title: pageName,
          value: Math.round(loadTime),
        });
      }
    };
  }, [pageName]);
}
