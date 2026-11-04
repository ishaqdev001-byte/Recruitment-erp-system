import React, { useEffect, useRef, useState } from 'react';

interface PageTransitionWrapperProps {
  children: React.ReactNode;
  isLoading?: boolean;
  animationType?: 'fadeIn' | 'slideInUp' | 'slideInDown' | 'slideInLeft' | 'slideInRight' | 'scaleIn';
  skipAnimation?: boolean;
  delay?: number;
}

export default function PageTransitionWrapper({
  children,
  isLoading = false,
  animationType = 'fadeIn',
  skipAnimation = false,
  delay = 0,
}: PageTransitionWrapperProps) {
  const [show, setShow] = useState(skipAnimation);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Respect user's motion preferences
  const prefersReducedMotion = 
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    setMounted(true);
    if (skipAnimation) {
      setShow(true);
      return;
    }

    if (prefersReducedMotion) {
      setShow(true);
      return;
    }

    let timer: NodeJS.Timeout;
    if (delay > 0) {
      timer = setTimeout(() => {
        requestAnimationFrame(() => setShow(true));
      }, delay);
    } else {
      requestAnimationFrame(() => setShow(true));
    }

    return () => clearTimeout(timer);
  }, [skipAnimation, prefersReducedMotion, delay]);

  // Select animation type
  const finalAnimationType = prefersReducedMotion ? 'fadeIn' : animationType;

  return (
    <div
      ref={containerRef}
      className={`page-content ${!isLoading && show ? finalAnimationType : ''}`}
      data-animation={!isLoading && show ? finalAnimationType : 'none'}
    >
      {isLoading ? (
        <div className="space-y-3 p-4 md:p-6">
          {/* Optimized skeleton loaders */}
          <div className="skeleton h-10 w-full rounded animate-pulse" />
          <div className="skeleton h-40 w-full rounded animate-pulse" />
          <div className="flex gap-3">
            <div className="skeleton h-24 w-1/3 rounded animate-pulse" />
            <div className="skeleton h-24 w-1/3 rounded animate-pulse" />
            <div className="skeleton h-24 w-1/3 rounded animate-pulse" />
          </div>
        </div>
      ) : (
        <div className={!mounted ? 'opacity-0' : 'opacity-100'}>
          {children}
        </div>
      )}
    </div>
  );
}
