/**
 * Performance Optimization Examples
 * Real-world usage patterns for all optimization phases
 */

// ============================================================================
// PHASE 2: PAGINATION EXAMPLES
// ============================================================================

/**
 * Example 1: Using pagination in API calls
 */
export async function fetchAgentsWithPagination(pageNumber: number = 1) {
  const limit = 50
  const offset = (pageNumber - 1) * limit

  const response = await fetch(`/api/workspace/agents?limit=${limit}&offset=${offset}`)
  const { agents, pagination, branches } = await response.json()

  return {
    agents,
    branches,
    pagination,
    currentPage: pageNumber,
    totalPages: Math.ceil(pagination.total / limit),
  }
}

/**
 * Example 2: Cursor-based pagination for efficient streaming
 */
export async function fetchAgentsWithCursor(cursor?: string) {
  const params = new URLSearchParams({ limit: "50" })
  if (cursor) {
    params.append("cursor", cursor)
  }

  const response = await fetch(`/api/workspace/agents?${params}`)
  const { agents, pagination } = await response.json()

  return {
    agents,
    hasMore: pagination.has_next,
    nextCursor: pagination.next_cursor,
  }
}

/**
 * Example 3: Implementing pagination in a React component
 */
export function AgentListWithPagination() {
  const [page, setPage] = useState(1)
  const [agents, setAgents] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchAgentsWithPagination(page).then((data) => {
      setAgents(data.agents)
      setPagination(data.pagination)
      setLoading(false)
    })
  }, [page])

  return (
    <div>
      <div>
        {agents.map((agent) => (
          <div key={agent.id}>{agent.name}</div>
        ))}
      </div>

      <div>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>

        <span>
          Page {page} of {Math.ceil(pagination?.total / 50)}
        </span>

        <button
          disabled={!pagination?.has_next}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

/**
 * Example 4: Infinite scroll with cursor pagination
 */
export function InfiniteAgentList() {
  const [agents, setAgents] = useState([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadMore = async () => {
    setLoading(true)
    const data = await fetchAgentsWithCursor(cursor)
    setAgents((prev) => [...prev, ...data.agents])
    setCursor(data.nextCursor)
    setLoading(false)
  }

  useEffect(() => {
    loadMore()
  }, [])

  return (
    <div>
      {agents.map((agent) => (
        <div key={agent.id}>{agent.name}</div>
      ))}

      {loading && <div>Loading...</div>}

      {!loading && cursor && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  )
}

// ============================================================================
// PHASE 3: CACHE HEADERS EXAMPLES
// ============================================================================

/**
 * Example 5: Backend - Using cache headers in API endpoints
 */
import { getCacheHeaders } from "@/lib/cache-headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // List data - 5 minute cache
  const listHeaders = getCacheHeaders("list")

  // Settings data - 1 hour cache
  const settingsHeaders = getCacheHeaders("settings")

  // Reference data - 1 day cache
  const referenceHeaders = getCacheHeaders("reference")

  // Real-time data - no cache
  const realtimeHeaders = getCacheHeaders("real-time")

  const data = { /* your data */ }

  return NextResponse.json(data, {
    headers: listHeaders, // Choose appropriate cache level
  })
}

/**
 * Example 6: Frontend - Leveraging cached responses
 */
export async function useCachedEmployersList() {
  const [employers, setEmployers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // First call: 5 min cache
    // Browser will return cached response within 5 minutes
    // Subsequent calls while cache is valid return instantly
    fetch("/api/employers")
      .then((res) => res.json())
      .then((data) => {
        setEmployers(data)
        setLoading(false)
      })
  }, [])

  return { employers, loading }
}

/**
 * Example 7: Conditional cache invalidation
 */
export async function updateBranch(branchId: string, data: BranchData) {
  // Update the branch
  const response = await fetch(`/api/branches/${branchId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })

  // After update, the cache is stale but still valid for a while
  // Browser will show cached data while fetching fresh data (SWR)
  // Or manually invalidate:
  if ("caches" in window) {
    const cache = await caches.open("http-cache")
    await cache.delete("/api/branches")
  }

  return response.json()
}

// ============================================================================
// PHASE 4: VIRTUAL SCROLLING EXAMPLES
// ============================================================================

import { useVirtualScroll, useVirtualLazyLoad, useInfiniteScroll } from "@/lib/virtual-scroll-hooks"

/**
 * Example 8: Basic virtual scrolling with fixed heights
 */
export function VirtualAgentList({ agents }) {
  const { startIndex, endIndex, offset, totalHeight } = useVirtualScroll({
    containerHeight: 600,
    itemHeight: 50,
    totalItems: agents.length,
  })

  return (
    <div
      style={{
        height: 600,
        overflow: "auto",
        border: "1px solid #ccc",
      }}
    >
      <div style={{ height: totalHeight }}>
        <div
          style={{
            transform: `translateY(${offset}px)`,
          }}
        >
          {agents.slice(startIndex, endIndex).map((agent) => (
            <div
              key={agent.id}
              style={{
                height: 50,
                padding: 10,
                borderBottom: "1px solid #eee",
              }}
            >
              <div>{agent.name}</div>
              <div style={{ fontSize: "0.9em", color: "#666" }}>
                {agent.email}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Example 9: Virtual scrolling with lazy loading
 */
export function VirtualLazyAgentList() {
  const [allAgents, setAllAgents] = useState([])

  const { items, isLoading, handleLoadMore } = useVirtualLazyLoad({
    initialItems: allAgents,
    loadMore: async (offset, limit) => {
      const response = await fetch(
        `/api/workspace/agents?limit=${limit}&offset=${offset}`
      )
      const { agents } = await response.json()
      return agents
    },
    pageSize: 50,
    loadThreshold: 0.8,
  })

  const { startIndex, endIndex, offset, totalHeight } = useVirtualScroll(
    {
      containerHeight: 600,
      itemHeight: 50,
      totalItems: items.length,
      onScroll: handleLoadMore,
    }
  )

  return (
    <div
      style={{
        height: 600,
        overflow: "auto",
        border: "1px solid #ccc",
      }}
    >
      <div style={{ height: totalHeight }}>
        <div style={{ transform: `translateY(${offset}px)` }}>
          {items.slice(startIndex, endIndex).map((agent) => (
            <div
              key={agent.id}
              style={{
                height: 50,
                padding: 10,
                borderBottom: "1px solid #eee",
              }}
            >
              {agent.name}
            </div>
          ))}
        </div>
      </div>

      {isLoading && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            background: "#f9f9f9",
          }}
        >
          Loading more...
        </div>
      )}
    </div>
  )
}

/**
 * Example 10: Infinite scroll with Intersection Observer
 */
export function InfiniteScrollAgentList() {
  const [agents, setAgents] = useState([])
  const [page, setPage] = useState(0)

  const { targetRef, isNearEnd } = useInfiniteScroll({
    onNearEnd: () => {
      setPage((prev) => prev + 1)
    },
    threshold: 0.1,
  })

  useEffect(() => {
    // Load more agents when page changes
    fetch(`/api/workspace/agents?limit=50&offset=${page * 50}`)
      .then((res) => res.json())
      .then((data) => {
        if (page === 0) {
          setAgents(data.agents)
        } else {
          setAgents((prev) => [...prev, ...data.agents])
        }
      })
  }, [page])

  return (
    <div>
      {agents.map((agent) => (
        <div
          key={agent.id}
          style={{
            padding: 15,
            borderBottom: "1px solid #eee",
          }}
        >
          <div>{agent.name}</div>
          <div style={{ fontSize: "0.9em", color: "#666" }}>
            {agent.email}
          </div>
        </div>
      ))}

      <div
        ref={targetRef}
        style={{
          padding: 20,
          textAlign: "center",
        }}
      >
        {isNearEnd ? <div>Loading more...</div> : <div>Load more</div>}
      </div>
    </div>
  )
}

// ============================================================================
// PHASE 5: ADVANCED OPTIMIZATIONS EXAMPLES
// ============================================================================

import {
  QueryOptimizations,
  OptimizedQueryBuilder,
  apiProfiler,
  queryMonitor,
  fieldSelector,
} from "@/lib/advanced-optimizations"

/**
 * Example 11: Detecting N+1 queries
 */
export async function detectNPlusOneInCandidates() {
  // Simulate N+1 pattern
  for (const candidate of candidates) {
    queryMonitor.record(
      `SELECT * FROM candidate_documents WHERE candidate_id = '${candidate.id}'`,
      Math.random() * 50
    )
  }

  // Check for patterns
  const nPlusOne = queryMonitor.detectNPlusOne()
  if (nPlusOne.length > 0) {
    console.error("N+1 queries detected!")
    nPlusOne.forEach((query) => {
      console.log(
        `  - ${query.query.substring(0, 60)}... (${query.duration}ms)`
      )
    })

    // Fix: Use JOIN or batch load instead
    // const documents = await supabase
    //   .from("candidate_documents")
    //   .select("*")
    //   .in("candidate_id", candidateIds)
  }
}

/**
 * Example 12: Building optimized queries
 */
export function buildOptimizedCandidateQuery(companyId: string) {
  const query = new OptimizedQueryBuilder("candidates")
    .select("id", "first_name", "last_name", "email", "status")
    .where("company_id", companyId)
    .where("status", "active")
    .orderBy("created_at", false)
    .take(50)
    .skip(0)

  // Check for optimization issues
  const { issues } = query.isOptimized()
  if (issues.length > 0) {
    console.warn("Query optimization suggestions:")
    issues.forEach((issue) => console.warn(`  - ${issue}`))
  }

  // Get SQL representation
  const sql = query.buildQuery()
  console.log("Generated SQL:", sql)
  // Output: SELECT id, first_name, last_name, email, status FROM candidates WHERE company_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50

  return query
}

/**
 * Example 13: Performance profiling
 */
export async function profileAPIEndpoints() {
  // Profile several endpoints
  const endpoints = ["/api/workspace/agents", "/api/projects", "/api/employers"]

  for (const endpoint of endpoints) {
    const start = performance.now()
    try {
      const response = await fetch(endpoint)
      const duration = performance.now() - start

      apiProfiler.record(endpoint, "GET", duration, response.status)
    } catch (error) {
      const duration = performance.now() - start
      apiProfiler.record(endpoint, "GET", duration, 500)
    }
  }

  // Get performance report
  const summary = apiProfiler.getSummary()
  console.log("API Performance Summary:", {
    totalCalls: summary.totalCalls,
    avgDuration: `${summary.avgDuration.toFixed(2)}ms`,
    p95Duration: `${summary.p95Duration.toFixed(2)}ms`,
    p99Duration: `${summary.p99Duration.toFixed(2)}ms`,
  })

  // Get slowest endpoints
  const slowest = apiProfiler.getSlowest(5)
  console.log("Slowest Endpoints:", slowest)

  // Get error rates
  const errors = apiProfiler.getErrorRates()
  console.log("Error Rates:", errors)
}

/**
 * Example 14: Field selection optimization
 */
export async function optimizeFieldSelection(table: string) {
  // Record field accesses during application usage
  fieldSelector.recordAccess("candidates", "id")
  fieldSelector.recordAccess("candidates", "name")
  fieldSelector.recordAccess("candidates", "email")
  // ... more accesses ...

  // Get recommended fields
  const recommended = fieldSelector.getRecommendedFields(table)
  console.log("Recommended fields for SELECT:", recommended)

  // Find unused fields (potential over-fetching)
  const allFields = [
    "id",
    "name",
    "email",
    "phone",
    "address",
    "salary_range",
    "visa_type",
    // ... more fields ...
  ]
  const unused = fieldSelector.analyzeUnusedFields(table, allFields)
  console.log("Unused fields (consider removing from SELECT):", unused)
}

/**
 * Example 15: Complete performance monitoring setup
 */
export function setupPerformanceMonitoring() {
  // Monitor every minute
  setInterval(() => {
    const apiStats = apiProfiler.getSummary()
    const queryStats = QueryOptimizations.getPerformanceReport()

    // Log to monitoring service
    console.log({
      timestamp: new Date().toISOString(),
      api: {
        totalCalls: apiStats.totalCalls,
        avgLatency: apiStats.avgDuration,
        p95Latency: apiStats.p95Duration,
        slowCalls: apiStats.maxDuration,
      },
      queries: {
        total: queryStats.totalQueries,
        avg: queryStats.avgDuration,
        slowCount: queryStats.slowQueries.length,
        nPlusOneCount: queryStats.nPlusOnePatterns.length,
      },
    })

    // Alert on issues
    if (queryStats.nPlusOnePatterns.length > 5) {
      console.error("⚠️ Multiple N+1 patterns detected")
    }

    if (apiStats.p95Duration > 1000) {
      console.error("⚠️ P95 latency exceeding 1 second")
    }
  }, 60000)
}

/**
 * Example 16: Combining all optimizations
 */
export async function getOptimizedAgentList(pageNumber: number = 1) {
  const startTime = performance.now()

  try {
    // Build optimized query
    const query = new OptimizedQueryBuilder("company_recruitment_agents")
      .select("id", "name", "email", "phone", "status")
      .where("company_id", "current-company-id")
      .take(50)
      .skip((pageNumber - 1) * 50)

    // Check for issues
    const { issues } = query.isOptimized()
    if (issues.length > 0) {
      console.warn("Query could be optimized:", issues)
    }

    // Fetch with pagination
    const limit = 50
    const offset = (pageNumber - 1) * limit
    const response = await fetch(
      `/api/workspace/agents?limit=${limit}&offset=${offset}`
    )

    const duration = performance.now() - startTime

    // Record metrics
    queryMonitor.record(query.buildQuery(), duration)
    apiProfiler.record("/api/workspace/agents", "GET", duration, response.status)
    fieldSelector.recordAccess(
      "company_recruitment_agents",
      "id",
      "name",
      "email",
      "phone",
      "status"
    )

    const { agents, pagination } = await response.json()

    return {
      agents,
      pagination,
      metrics: {
        duration,
        queriesDetected: QueryOptimizations.checkForNPlusOne().length,
      },
    }
  } catch (error) {
    const duration = performance.now() - startTime
    apiProfiler.record("/api/workspace/agents", "GET", duration, 500)
    throw error
  }
}

// ============================================================================
// INTEGRATION HELPER - COMPLETE EXAMPLE
// ============================================================================

/**
 * Example 17: Complete agent list component with all optimizations
 */
export function OptimizedAgentListComponent() {
  const [page, setPage] = useState(1)
  const [agents, setAgents] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [perfMetrics, setPerfMetrics] = useState(null)

  // Use virtual scrolling for the visible items
  const { startIndex, endIndex, offset, totalHeight } = useVirtualScroll({
    containerHeight: 600,
    itemHeight: 50,
    totalItems: agents.length,
  })

  useEffect(() => {
    setLoading(true)
    getOptimizedAgentList(page)
      .then((data) => {
        setAgents(data.agents)
        setPagination(data.pagination)
        setPerfMetrics(data.metrics)
        setLoading(false)
      })
      .catch((error) => {
        console.error("Failed to load agents:", error)
        setLoading(false)
      })
  }, [page])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2>Optimized Agent List</h2>
        {perfMetrics && (
          <div style={{ fontSize: "0.9em", color: "#666" }}>
            Loaded in {perfMetrics.duration.toFixed(2)}ms
            {perfMetrics.queriesDetected > 0 && (
              <span style={{ color: "red", marginLeft: 10 }}>
                ⚠️ {perfMetrics.queriesDetected} N+1 queries detected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Virtual scrolling container */}
      <div
        style={{
          height: 600,
          overflow: "auto",
          border: "1px solid #ccc",
          marginBottom: 20,
        }}
      >
        <div style={{ height: totalHeight }}>
          <div style={{ transform: `translateY(${offset}px)` }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: "center" }}>
                Loading agents...
              </div>
            ) : agents.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center" }}>
                No agents found
              </div>
            ) : (
              agents.slice(startIndex, endIndex).map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    height: 50,
                    padding: 10,
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "bold" }}>{agent.name}</div>
                    <div style={{ fontSize: "0.85em", color: "#666" }}>
                      {agent.email}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pagination controls */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          disabled={page === 1 || loading}
          onClick={() => setPage(page - 1)}
        >
          ← Previous
        </button>

        <span style={{ padding: "10px" }}>
          Page {page}
          {pagination && ` of ${Math.ceil(pagination.total / 50)}`}
        </span>

        <button
          disabled={!pagination?.has_next || loading}
          onClick={() => setPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

export default OptimizedAgentListComponent
