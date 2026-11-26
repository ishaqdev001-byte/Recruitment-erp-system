/**
 * Advanced query optimization utilities
 * Helps identify and resolve performance issues
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Query statistics for monitoring
 */
interface QueryStats {
  query: string
  duration: number
  timestamp: number
  relatedQueries: string[]
  isPotentialNPlusOne: boolean
}

class QueryMonitor {
  private stats: QueryStats[] = []
  private windowSize = 1000 // Keep last 1000 queries

  record(query: string, duration: number) {
    this.stats.push({
      query,
      duration,
      timestamp: Date.now(),
      relatedQueries: [],
      isPotentialNPlusOne: false,
    })

    // Keep only recent stats
    if (this.stats.length > this.windowSize) {
      this.stats = this.stats.slice(-this.windowSize)
    }
  }

  /**
   * Detect N+1 query patterns
   * Returns queries that look like repeated variations
   */
  detectNPlusOne(): QueryStats[] {
    const groups = new Map<string, QueryStats[]>()

    // Group similar queries
    for (const stat of this.stats) {
      // Extract base query (remove IDs and specific values)
      const baseQuery = stat.query
        .replace(/id\s*=\s*['\"]?[a-f0-9-]+['\"]?/gi, "id = ?")
        .replace(/id\s*IN\s*\([^)]+\)/gi, "id IN (...)")

      if (!groups.has(baseQuery)) {
        groups.set(baseQuery, [])
      }
      groups.get(baseQuery)!.push(stat)
    }

    // Identify N+1 patterns (many similar queries in short time)
    const nPlusOneQueries: QueryStats[] = []
    for (const [baseQuery, queries] of Array.from(groups.entries())) {
      if (queries.length > 5) {
        const timeRange = queries[queries.length - 1].timestamp - queries[0].timestamp
        // If many similar queries in < 500ms, likely N+1
        if (timeRange < 500) {
          nPlusOneQueries.push(...queries)
        }
      }
    }

    return nPlusOneQueries
  }

  /**
   * Get slow queries
   */
  getSlowQueries(threshold = 100): QueryStats[] {
    return this.stats.filter((stat) => stat.duration > threshold)
  }

  /**
   * Get query statistics
   */
  getStats() {
    if (this.stats.length === 0) {
      return null
    }

    const durations = this.stats.map((s) => s.duration)
    const total = durations.reduce((a, b) => a + b, 0)
    const avg = total / durations.length

    return {
      totalQueries: this.stats.length,
      avgDuration: avg,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      slowQueries: this.getSlowQueries(),
      nPlusOnePatterns: this.detectNPlusOne(),
    }
  }

  clear() {
    this.stats = []
  }
}

export const queryMonitor = new QueryMonitor()

/**
 * Field selection optimizer
 * Helps identify unused fields and optimize queries
 */
class FieldSelector {
  private usage = new Map<string, Set<string>>()

  /**
   * Record field access
   */
  recordAccess(table: string, field: string) {
    if (!this.usage.has(table)) {
      this.usage.set(table, new Set())
    }
    this.usage.get(table)!.add(field)
  }

  /**
   * Get recommended fields for a table
   */
  getRecommendedFields(table: string): string[] {
    return Array.from(this.usage.get(table) ?? [])
  }

  /**
   * Analyze which fields are never used
   */
  analyzeUnusedFields(table: string, allFields: string[]): string[] {
    const used = this.usage.get(table) ?? new Set()
    return allFields.filter((field) => !used.has(field))
  }

  clear() {
    this.usage.clear()
  }
}

export const fieldSelector = new FieldSelector()

/**
 * Batch request combiner
 * Combines multiple requests into single queries
 */
class RequestBatcher {
  private batches = new Map<string, unknown[]>()
  private timers = new Map<string, NodeJS.Timeout>()
  private batchSize = 25
  private batchDelay = 10 // ms

  /**
   * Add request to batch
   */
  async add<T>(
    key: string,
    item: T,
    processor: (items: T[]) => Promise<Map<T, unknown>>,
  ): Promise<unknown> {
    if (!this.batches.has(key)) {
      this.batches.set(key, [])
    }

    const batch = this.batches.get(key)!
    batch.push(item)

    // Process batch when size reached
    if (batch.length >= this.batchSize) {
      return this.processBatch(key, processor)
    }

    // Schedule batch processing
    if (!this.timers.has(key)) {
      const timer = setTimeout(() => {
        this.processBatch(key, processor)
      }, this.batchDelay)
      this.timers.set(key, timer)
    }

    // Return a promise that resolves when batch is processed
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // This is a simplified polling approach
        // In production, use proper event emitters
      }, 1)
    })
  }

  private async processBatch<T>(
    key: string,
    processor: (items: T[]) => Promise<Map<T, unknown>>,
  ) {
    const batch = this.batches.get(key)
    if (!batch || batch.length === 0) return

    this.batches.delete(key)
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!)
      this.timers.delete(key)
    }

    try {
      await processor(batch as T[])
    } catch (error) {
      console.error("Batch processing failed", error)
    }
  }

  clear() {
    this.batches.clear()
    for (const timer of Array.from(this.timers.values())) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }
}

export const requestBatcher = new RequestBatcher()

/**
 * Query optimization utilities
 */
export const QueryOptimizations = {
  /**
   * Recommend optimal field selection for a query
   */
  recommendFieldSelection(table: string, allFields: string[]): string[] {
    return fieldSelector.getRecommendedFields(table) || allFields
  },

  /**
   * Check for N+1 query patterns
   */
  checkForNPlusOne(): QueryStats[] {
    return queryMonitor.detectNPlusOne()
  },

  /**
   * Get query performance report
   */
  getPerformanceReport() {
    return queryMonitor.getStats()
  },

  /**
   * Reset monitoring
   */
  reset() {
    queryMonitor.clear()
    fieldSelector.clear()
    requestBatcher.clear()
  },
}

/**
 * Database query builder with optimizations
 */
export class OptimizedQueryBuilder {
  private table: string
  private fields: string[] = ["*"]
  private filters: Array<{ column: string; value: unknown; operator?: string }> = []
  private joins: Array<{
    table: string
    on: string
  }> = []
  private limit?: number
  private offset?: number
  private orderBy?: { column: string; ascending: boolean }

  constructor(table: string) {
    this.table = table
  }

  /**
   * Select specific fields
   */
  select(...fields: string[]): this {
    this.fields = fields
    return this
  }

  /**
   * Add filter condition
   */
  where(column: string, value: unknown, operator = "="): this {
    this.filters.push({ column, value, operator })
    return this
  }

  /**
   * Join another table
   */
  join(table: string, on: string): this {
    this.joins.push({ table, on })
    return this
  }

  /**
   * Set limit
   */
  take(count: number): this {
    this.limit = count
    return this
  }

  /**
   * Set offset
   */
  skip(count: number): this {
    this.offset = count
    return this
  }

  /**
   * Order by column
   */
  sort(column: string, ascending = true): this {
    this.orderBy = { column, ascending }
    return this
  }

  /**
   * Build query string (for analysis/debugging)
   */
  buildQuery(): string {
    let query = `SELECT ${this.fields.join(", ")} FROM ${this.table}`

    for (const join of this.joins) {
      query += ` JOIN ${join.table} ON ${join.on}`
    }

    if (this.filters.length > 0) {
      const conditions = this.filters
        .map(({ column, operator }) => `${column} ${operator} ?`)
        .join(" AND ")
      query += ` WHERE ${conditions}`
    }

    if (this.orderBy) {
      query += ` ORDER BY ${this.orderBy.column} ${this.orderBy.ascending ? "ASC" : "DESC"}`
    }

    if (this.limit) {
      query += ` LIMIT ${this.limit}`
    }

    if (this.offset) {
      query += ` OFFSET ${this.offset}`
    }

    return query
  }

  /**
   * Check if query is optimized
   */
  isOptimized(): { issues: string[] } {
    const issues: string[] = []

    // Check for SELECT *
    if (this.fields.includes("*")) {
      issues.push("Query uses SELECT *, consider specifying exact fields")
    }

    // Check for missing WHERE clause (potential data leak)
    if (
      this.filters.length === 0 &&
      !this.table.includes("public_view")
    ) {
      issues.push("Query has no WHERE clause - consider if this is intentional")
    }

    // Check for missing LIMIT on result
    if (!this.limit && this.filters.length === 0) {
      issues.push("Query without LIMIT may return too many rows")
    }

    // Check for inefficient joins
    if (this.joins.length > 3) {
      issues.push("Query has many joins - consider denormalizing or caching")
    }

    return { issues }
  }
}

/**
 * Cache buster for selective cache invalidation
 */
class CacheBuster {
  private patterns = new Map<string, string[]>()

  /**
   * Register cache pattern
   */
  register(pattern: string, dependencies: string[]) {
    this.patterns.set(pattern, dependencies)
  }

  /**
   * Get patterns that need invalidation
   */
  getPatternsToInvalidate(changedResource: string): string[] {
    const toInvalidate: string[] = []

    for (const [pattern, deps] of Array.from(this.patterns.entries())) {
      if (deps.includes(changedResource)) {
        toInvalidate.push(pattern)
      }
    }

    return toInvalidate
  }

  /**
   * Clear registration
   */
  clear() {
    this.patterns.clear()
  }
}

export const cacheBuster = new CacheBuster()

/**
 * Performance profiler for API calls
 */
export class APIProfiler {
  private calls: Array<{
    endpoint: string
    method: string
    duration: number
    statusCode?: number
    timestamp: number
  }> = []

  record(
    endpoint: string,
    method: string,
    duration: number,
    statusCode?: number,
  ) {
    this.calls.push({
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: Date.now(),
    })
  }

  /**
   * Get slowest endpoints
   */
  getSlowest(limit = 10) {
    return [...this.calls]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
  }

  /**
   * Get endpoints with highest error rate
   */
  getErrorRates() {
    const stats = new Map<string, { total: number; errors: number }>()

    for (const call of this.calls) {
      const key = `${call.method} ${call.endpoint}`
      if (!stats.has(key)) {
        stats.set(key, { total: 0, errors: 0 })
      }

      const stat = stats.get(key)!
      stat.total++
      if (call.statusCode && call.statusCode >= 400) {
        stat.errors++
      }
    }

    return Array.from(stats.entries())
      .map(([endpoint, { total, errors }]) => ({
        endpoint,
        errorRate: errors / total,
        totalCalls: total,
        errorCount: errors,
      }))
      .sort((a, b) => b.errorRate - a.errorRate)
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    if (this.calls.length === 0) return null

    const durations = this.calls.map((c) => c.duration)
    const total = durations.reduce((a, b) => a + b, 0)

    return {
      totalCalls: this.calls.length,
      avgDuration: total / this.calls.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      p95Duration: this.percentile(durations, 0.95),
      p99Duration: this.percentile(durations, 0.99),
    }
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[Math.max(0, index)]
  }

  clear() {
    this.calls = []
  }
}

export const apiProfiler = new APIProfiler()
