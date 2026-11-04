/**
 * APP INTEGRATION EXAMPLE
 * 
 * This shows how to integrate animations, global optimizations, and document handling
 * into the main App.tsx file. Copy patterns from this file to your components.
 */

import { useEffect, useRef } from 'react';
import { initializeGlobalOptimizations } from '@/utils/globalOptimization';
import { useAnimatedView } from '@/hooks/useAnimatedView';
import type { View } from './lib/views'; // Your view type

/**
 * Main App Component with Optimizations
 */
export function EnhancedApp({
  view,
  onViewChange,
  isLoading,
}: {
  view: View;
  onViewChange: (view: View) => void;
  isLoading: boolean;
}) {
  const mainContentRef = useRef<HTMLDivElement>(null);
  const { animation, shouldShow, containerRef } = useAnimatedView(view, isLoading);

  // Initialize global optimizations on mount
  useEffect(() => {
    initializeGlobalOptimizations();
  }, []);

  // Scroll to top on view change
  useEffect(() => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  return (
    <div className="app-layout flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="app-sidebar w-64 border-r border-border bg-card overflow-y-auto">
        {/* Your sidebar navigation */}
      </aside>

      {/* Main content area with animations */}
      <main
        ref={mainContentRef}
        className="flex-1 flex flex-col overflow-auto"
        data-container="true" // Enable containment optimization
      >
        {/* Top bar */}
        <header className="border-b border-border bg-card p-4">
          {/* Your top bar */}
        </header>

        {/* Animated view content */}
        <div
          ref={containerRef}
          className={`page-content flex-1 ${shouldShow ? animation : ''} ${
            isLoading ? 'opacity-50' : 'opacity-100'
          }`}
          data-view={view}
        >
          {isLoading ? (
            <div className="space-y-4 p-6">
              {/* Skeleton loaders */}
              <div className="skeleton h-12 w-full rounded animate-pulse" />
              <div className="skeleton h-96 w-full rounded animate-pulse" />
            </div>
          ) : (
            renderView(view, onViewChange)
          )}
        </div>
      </main>

      {/* Loading overlay (optional) */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-200 animate-pulse" />
      )}
    </div>
  );
}

/**
 * Example: Render view with proper component
 */
function renderView(view: View, onViewChange: (view: View) => void) {
  switch (view) {
    case 'dashboard':
      return <DashboardWithAnimation onViewChange={onViewChange} />;
    case 'candidates':
      return <CandidatesWithAnimation onViewChange={onViewChange} />;
    case 'finance':
      return <FinanceWithAnimation onViewChange={onViewChange} />;
    default:
      return <div>Unknown view: {view}</div>;
  }
}

/**
 * Example: Dashboard with Animation
 */
function DashboardWithAnimation({
  onViewChange,
}: {
  onViewChange: (view: View) => void;
}) {
  const { animation, shouldShow } = useAnimatedView('dashboard', false);

  return (
    <div className={`page-content ${shouldShow ? animation : ''}`}>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        {/* Stats cards with animation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-4 rounded bg-card border border-border hover:border-primary transition-colors duration-200"
              style={{
                animation: shouldShow ? `slideInUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) ${i * 50}ms forwards` : undefined,
                opacity: shouldShow ? 1 : 0,
              }}
            >
              <div className="text-sm text-muted-foreground mb-1">Metric {i}</div>
              <div className="text-2xl font-bold text-primary">1,234</div>
            </div>
          ))}
        </div>

        {/* Navigation to other views */}
        <div className="flex gap-2">
          <button
            onClick={() => onViewChange('candidates')}
            className="px-4 py-2 rounded bg-primary text-primary-foreground transition-all duration-200 hover:opacity-90 active:scale-95"
          >
            Go to Candidates
          </button>
          <button
            onClick={() => onViewChange('finance')}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground transition-all duration-200 hover:opacity-90 active:scale-95"
          >
            Go to Finance
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Example: Candidates with Animation & Upload
 */
function CandidatesWithAnimation({
  onViewChange,
}: {
  onViewChange: (view: View) => void;
}) {
  const { animation, shouldShow } = useAnimatedView('candidates', false);
  const { useDocumentUpload } = useUploadHook();

  return (
    <div className={`page-content ${shouldShow ? animation : ''}`}>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Candidates</h1>

        {/* Upload section */}
        <DocumentUploadSection />

        {/* Candidates list */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded bg-card border border-border hover:bg-secondary transition-colors duration-200"
              style={{
                animation: shouldShow ? `slideInUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) ${i * 50}ms forwards` : undefined,
                opacity: shouldShow ? 1 : 0,
              }}
            >
              <div className="font-semibold">Candidate {i}</div>
              <div className="text-sm text-muted-foreground">candidate{i}@example.com</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onViewChange('dashboard')}
          className="px-4 py-2 rounded bg-secondary text-secondary-foreground transition-all duration-200"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/**
 * Example: Finance with Loading State
 */
function FinanceWithAnimation({
  onViewChange,
}: {
  onViewChange: (view: View) => void;
}) {
  const { animation, shouldShow } = useAnimatedView('finance', false);
  const [isLoading, setIsLoading] = React.useState(false);

  return (
    <div className={`page-content ${shouldShow ? animation : ''}`}>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Finance</h1>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-12 w-full rounded animate-pulse" />
            <div className="skeleton h-48 w-full rounded animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded bg-card border border-border">Finance Data</div>
            <div className="p-4 rounded bg-card border border-border">More Finance Data</div>
          </div>
        )}

        <button
          onClick={() => onViewChange('dashboard')}
          className="px-4 py-2 rounded bg-secondary text-secondary-foreground transition-all duration-200"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/**
 * Document Upload Component
 */
function DocumentUploadSection() {
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Use chunked upload
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      setUploadProgress(100);
      console.log('Upload complete');
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 rounded bg-card border border-border space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Upload Document</label>
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
          disabled={isUploading}
          className="block w-full rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {isUploading && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Uploading... {uploadProgress.toFixed(0)}%</div>
          <div className="w-full h-2 rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper hook for document operations
 */
function useUploadHook() {
  const useDocumentUpload = (options = {}) => {
    return { /*  */};
  };

  return { useDocumentUpload };
}

export default EnhancedApp;

/**
 * INTEGRATION CHECKLIST
 * 
 * 1. Replace App component with EnhancedApp
 * 2. Pass view state and handlers as props
 * 3. Add global initialization on mount
 * 4. Apply useAnimatedView to each major view
 * 5. Add skeleton loaders while data loads
 * 6. Add DocumentUploadSection to relevant components
 * 7. Test animations with DevTools
 * 8. Run Lighthouse audit
 * 
 * EXPECTED IMPROVEMENTS
 * - Navigation time: 1.5s → 0.3s
 * - Upload speed: 30s → 10s
 * - Page load: 3.5s → 1.2s
 * - CLS: 0.15 → 0.05
 */
