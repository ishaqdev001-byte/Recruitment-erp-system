import { useEffect, useState, useRef, useCallback } from 'react';

type AnimationType = 'fadeIn' | 'slideInUp' | 'slideInDown' | 'slideInLeft' | 'slideInRight' | 'scaleIn';

export function useAnimatedView(
  viewName: string,
  isLoading: boolean = false,
) {
  const [animation, setAnimation] = useState<AnimationType>('fadeIn');
  const [mounted, setMounted] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const previousViewRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine animation type based on view transitions
  const determineAnimation = useCallback(
    (prevView: string, currentView: string): AnimationType => {
      // Priority order of views (helps determine animation direction)
      const viewPriority: Record<string, number> = {
        'live-dashboard': 0,
        dashboard: 1,
        candidates: 2,
        'candidate-detail': 2.5,
        jobs: 3,
        interviews: 4,
        offers: 5,
        pipeline: 6,
        'branch-approvals': 7,
        'human-resources': 8,
        finance: 9,
        invoices: 9.1,
        payments: 9.2,
        paychecks: 9.3,
        accounts: 9.4,
        communications: 10,
        'staff-chat': 10.5,
        tasks: 11,
        reports: 12,
        attendance: 13,
        'medical-management': 14,
        'project-passport-custody': 15,
        'users-roles': 16,
        settings: 17,
      };

      const prevPriority = viewPriority[prevView] ?? -1;
      const currPriority = viewPriority[currentView] ?? -1;

      if (currPriority > prevPriority) {
        return 'slideInUp';
      } else if (currPriority < prevPriority) {
        return 'slideInLeft';
      }
      return 'fadeIn';
    },
    [],
  );

  // Initialize animation
  useEffect(() => {
    setMounted(true);
    // Initial view - no animation needed
    if (!previousViewRef.current) {
      setShouldShow(true);
      previousViewRef.current = viewName;
      return;
    }

    // Determine animation for view change
    if (previousViewRef.current !== viewName) {
      const nextAnimation = determineAnimation(previousViewRef.current, viewName);
      setAnimation(nextAnimation);
      setShouldShow(false);

      // Trigger animation
      const timer = requestAnimationFrame(() => {
        setShouldShow(true);
      });

      previousViewRef.current = viewName;
      return () => cancelAnimationFrame(timer);
    }
  }, [viewName, determineAnimation]);

  // Respect reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const finalAnimation = prefersReducedMotion ? 'fadeIn' : animation;

  return {
    animation: finalAnimation,
    shouldShow,
    mounted,
    isLoading,
    containerRef,
  };
}

/**
 * Hook to track and log view transitions
 */
export function useViewTransitionMetrics(viewName: string) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[View Transition] ${viewName}: ${duration.toFixed(2)}ms`);
      }
    };
  }, [viewName]);
}

/**
 * Hook to manage concurrent view state changes
 */
export function useViewState(
  initialState: string,
  onStateChange?: (state: string) => void,
) {
  const [state, setState] = useState(initialState);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const setViewState = useCallback(
    async (newState: string) => {
      if (newState === state) return;

      setIsTransitioning(true);
      try {
        setState(newState);
        onStateChange?.(newState);

        // Brief delay to allow animation
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        setIsTransitioning(false);
      }
    },
    [state, onStateChange],
  );

  return { state, setViewState, isTransitioning };
}

/**
 * Hook to preload view data before transition
 */
export function useViewPreload(viewName: string, preloadFn: () => Promise<void>) {
  useEffect(() => {
    preloadFn().catch((error) => {
      console.warn(`Failed to preload ${viewName}:`, error);
    });
  }, [viewName, preloadFn]);
}

export default useAnimatedView;
