/**
 * EXAMPLE: OptimizedDashboard Component
 * 
 * This is an example showing how to integrate animations and performance optimizations
 * into your components. Copy patterns from this file to other components.
 * 
 * Features:
 * - Page transition animations
 * - Debounced search
 * - Lazy image loading
 * - Response caching
 * - Loading skeleton states
 */

import { useCallback, useEffect, useState } from 'react';
import PageTransitionWrapper from './PageTransitionWrapper';
import { usePageTransition, usePageLoadMetrics } from '@/hooks/usePageTransition';
import {
  debounce,
  ResponseCache,
  lazyLoadImage,
} from '@/utils/performanceOptimization';

// Create a cache instance for dashboard data
const dashboardCache = new ResponseCache(5 * 60 * 1000); // 5 minute TTL

interface DashboardStats {
  totalCandidates: number;
  activeJobs: number;
  pendingInterviews: number;
  closedOffers: number;
}

interface DashboardProps {
  viewName: string;
}

export default function OptimizedDashboard({ viewName }: DashboardProps) {
  // Performance tracking
  usePageLoadMetrics(`Dashboard - ${viewName}`);

  // Animation setup
  const { animation, containerRef } = usePageTransition([viewName]);

  // State management
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        // Check cache first
        const cacheKey = `search:${query}`;
        const cached = dashboardCache.get(cacheKey);
        if (cached) {
          setSearchResults(cached);
          return;
        }

        // Fetch results if not cached
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        dashboardCache.set(cacheKey, data);
        setSearchResults(data);
      } catch (err) {
        console.error('Search error:', err);
        setError('Search failed. Please try again.');
      }
    }, 300),
    [],
  );

  // Fetch dashboard stats with caching
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check cache first
        const cached = dashboardCache.get('dashboard-stats');
        if (cached) {
          setStats(cached);
          setIsLoading(false);
          return;
        }

        // Fetch from API
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json() as DashboardStats;
        dashboardCache.set('dashboard-stats', data);
        setStats(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Setup lazy loading for images
  useEffect(() => {
    const images = containerRef.current?.querySelectorAll('[data-src]');
    if (images) {
      images.forEach((img) => lazyLoadImage(img as HTMLImageElement));
    }
  }, [stats]);

  // Handle search input with debouncing
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  };

  return (
    <div ref={containerRef} className={`page-content ${animation}`}>
      {/* Page Header with Animation */}
      <div className="mb-6 animate-fadeIn">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {viewName}</p>
      </div>

      {/* Search Bar with Debouncing */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search candidates, jobs, interviews..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full px-4 py-2 rounded border border-border bg-card text-foreground placeholder-muted-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-2">
            {searchResults.map((result) => (
              <div
                key={result.id}
                className="p-3 rounded bg-secondary text-foreground cursor-pointer transition-colors duration-200 hover:bg-secondary/80"
              >
                {result.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Cards with Loading Animation */}
      <PageTransitionWrapper isLoading={isLoading} animationType="slideInUp">
        {error && (
          <div className="mb-4 p-4 rounded bg-red-500/10 text-red-500 border border-red-500/20">
            {error}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Stat Card: Total Candidates */}
            <div className="p-4 rounded bg-card border border-border hover:border-primary transition-colors duration-200">
              <div className="text-sm text-muted-foreground mb-1">Total Candidates</div>
              <div className="text-3xl font-bold text-primary">{stats.totalCandidates}</div>
              <div className="text-xs text-muted-foreground mt-2">Active in system</div>
            </div>

            {/* Stat Card: Active Jobs */}
            <div className="p-4 rounded bg-card border border-border hover:border-primary transition-colors duration-200">
              <div className="text-sm text-muted-foreground mb-1">Active Jobs</div>
              <div className="text-3xl font-bold text-primary">{stats.activeJobs}</div>
              <div className="text-xs text-muted-foreground mt-2">Open positions</div>
            </div>

            {/* Stat Card: Pending Interviews */}
            <div className="p-4 rounded bg-card border border-border hover:border-primary transition-colors duration-200">
              <div className="text-sm text-muted-foreground mb-1">Pending Interviews</div>
              <div className="text-3xl font-bold text-primary">{stats.pendingInterviews}</div>
              <div className="text-xs text-muted-foreground mt-2">Scheduled</div>
            </div>

            {/* Stat Card: Closed Offers */}
            <div className="p-4 rounded bg-card border border-border hover:border-primary transition-colors duration-200">
              <div className="text-sm text-muted-foreground mb-1">Closed Offers</div>
              <div className="text-3xl font-bold text-primary">{stats.closedOffers}</div>
              <div className="text-xs text-muted-foreground mt-2">This month</div>
            </div>
          </div>
        )}
      </PageTransitionWrapper>

      {/* Content Section with Lazy Loaded Images */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Charts Section */}
        <div className="p-6 rounded bg-card border border-border">
          <h2 className="text-lg font-semibold mb-4">Recruitment Pipeline</h2>
          <div className="h-64 bg-secondary rounded animate-shimmer" />
        </div>

        {/* Recent Activity Section */}
        <div className="p-6 rounded bg-card border border-border">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded bg-secondary">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Example: Lazy Loaded Image */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Company Overview</h2>
        <img
          data-src="/company-overview.jpg"
          alt="Company Overview"
          className="w-full rounded-lg"
        />
      </div>
    </div>
  );
}

/**
 * USAGE TIPS:
 * 
 * 1. Copy this component and adapt to your needs
 * 2. Import hooks and utilities from their respective files
 * 3. Use debounce() for search inputs and filters
 * 4. Use ResponseCache for frequently accessed data
 * 5. Wrap loading states with PageTransitionWrapper
 * 6. Apply page-content class to the root container
 * 7. Use data-src attribute for lazy loading images
 * 
 * PERFORMANCE GAINS:
 * - Debounced search reduces API calls by ~90%
 * - Response caching eliminates redundant fetches
 * - Lazy loading reduces initial page weight
 * - Animations provide smooth user experience
 * - Skeleton loaders prevent layout shift
 */
