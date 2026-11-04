import React, { useEffect, useState } from 'react';

interface PageTransitionWrapperProps {
  children: React.ReactNode;
  isLoading?: boolean;
  animationType?: 'fadeIn' | 'slideInUp' | 'slideInLeft' | 'slideInRight';
}

export default function PageTransitionWrapper({
  children,
  isLoading = false,
  animationType = 'fadeIn',
}: PageTransitionWrapperProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger animation on mount or when content changes
    const timer = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(timer);
  }, [children]);

  return (
    <div
      className={`page-content ${animationType} ${
        !isLoading && show ? 'opacity-100' : 'opacity-0'
      } transition-opacity duration-300`}
      style={{
        animation: show && !isLoading ? `${animationType} 0.35s ease-out` : undefined,
      }}
    >
      {isLoading ? (
        <div className="space-y-4 p-6">
          {/* Skeleton loader placeholder */}
          <div className="skeleton h-12 w-full rounded" />
          <div className="skeleton h-48 w-full rounded" />
          <div className="skeleton h-32 w-full rounded" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
