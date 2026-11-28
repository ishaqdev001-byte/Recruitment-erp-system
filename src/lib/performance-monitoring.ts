/**
 * Performance Monitoring and Analytics
 * Tracks page load times, API response times, and user interactions
 */

type PerformanceMetric = {
  name: string
  duration: number
  timestamp: number
  category: "api" | "component" | "navigation" | "render"
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private enabled = true
  private maxMetrics = 100

  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    duration: number,
    category: "api" | "component" | "navigation" | "render",
  ) {
    if (!this.enabled) return

    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      category,
    })

    // Keep only recent metrics to avoid memory leak
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log slow operations
    if (duration > 1000) {
      console.warn(
        `[Perf Warning] ${name} took ${duration.toFixed(0)}ms (slow)`,
      )
    }
  }

  /**
   * Get average response time for API calls
   */
  getAverageApiTime(): number {
    const apiMetrics = this.metrics.filter((m) => m.category === "api")
    if (apiMetrics.length === 0) return 0
    return (
      apiMetrics.reduce((sum, m) => sum + m.duration, 0) / apiMetrics.length
    )
  }

  /**
   * Get slowest operations in last N seconds
   */
  getSlowestOperations(limitSeconds: number = 60, topN: number = 5) {
    const cutoff = Date.now() - limitSeconds * 1000
    return this.metrics
      .filter((m) => m.timestamp > cutoff)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, topN)
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const apiMetrics = this.metrics.filter((m) => m.category === "api")
    const componentMetrics = this.metrics.filter(
      (m) => m.category === "component",
    )

    return {
      totalMetricsRecorded: this.metrics.length,
      averageApiTime: this.getAverageApiTime().toFixed(0),
      averageComponentTime:
        componentMetrics.length > 0
          ? (
              componentMetrics.reduce((sum, m) => sum + m.duration, 0) /
              componentMetrics.length
            ).toFixed(0)
          : "N/A",
      slowestOperations: this.getSlowestOperations(60, 3),
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = []
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
}

// Global instance
export const monitor = new PerformanceMonitor()

/**
 * Hook to auto-measure component render time
 */
export function useMeasureRender(componentName: string) {
  const startTime = performance.now()

  return () => {
    const duration = performance.now() - startTime
    monitor.recordMetric(componentName, duration, "component")
  }
}

/**
 * Measure API fetch time
 */
export async function measureFetch<T>(
  label: string,
  fetchFn: () => Promise<Response>,
): Promise<T> {
  const start = performance.now()
  try {
    const response = await fetchFn()
    const duration = performance.now() - start
    monitor.recordMetric(label, duration, "api")

    return (await response.json()) as T
  } catch (error) {
    const duration = performance.now() - start
    monitor.recordMetric(label, duration, "api")
    throw error
  }
}

/**
 * Measure navigation time
 */
export function measureNavigation(viewName: string) {
  const start = performance.now()
  return () => {
    const duration = performance.now() - start
    monitor.recordMetric(`Navigate to ${viewName}`, duration, "navigation")
  }
}

/**
 * Performance observer for browser's native metrics
 */
export function setupPerformanceObserver() {
  if (!("PerformanceObserver" in window)) return

  try {
    // Measure Largest Contentful Paint (when page becomes visually complete)
    const paintObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === "largest-contentful-paint") {
          console.log(
            `[Perf] Page visually complete: ${entry.startTime.toFixed(0)}ms`,
          )
        }
      }
    })
    paintObserver.observe({ entryTypes: ["largest-contentful-paint"] })

    // Measure Time to Interactive
    const navigationObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry instanceof PerformanceNavigationTiming) {
          console.log(
            `[Perf] Page load complete: ${entry.loadEventEnd.toFixed(0)}ms`,
          )
        }
      }
    })
    navigationObserver.observe({ entryTypes: ["navigation"] })

    // Measure slow resources
    const resourceObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.duration > 500) {
          console.warn(
            `[Perf Warning] Slow resource: ${entry.name} (${entry.duration.toFixed(0)}ms)`,
          )
        }
      }
    })
    resourceObserver.observe({ entryTypes: ["resource"] })
  } catch (error) {
    console.debug("Performance observer not supported")
  }
}

/**
 * Export metrics for analysis
 */
export function exportMetrics() {
  return {
    timestamp: new Date().toISOString(),
    summary: monitor.getSummary(),
    allMetrics: JSON.stringify(monitor["metrics"], null, 2),
  }
}

/**
 * Performance report generator
 */
export function generateReport() {
  const summary = monitor.getSummary()
  console.group("📊 Performance Report")
  console.table(summary)
  console.log("Slowest operations:")
  console.table(summary.slowestOperations)
  console.groupEnd()
}
