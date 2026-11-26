/**
 * Performance utilities for optimizing data fetching and rendering
 */

/**
 * Fetch multiple URLs in parallel with error handling
 * @param requests Array of {url, options} objects
 * @returns Array of responses in same order
 */
export async function fetchParallel(
  requests: Array<{
    url: string
    options?: RequestInit
  }>,
): Promise<Response[]> {
  return Promise.all(
    requests.map(({ url, options }) =>
      fetch(url, { cache: "no-store", ...options }),
    ),
  )
}

/**
 * Debounce function calls to reduce excessive updates
 * @param fn Function to debounce
 * @param delay Delay in milliseconds
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Throttle function calls to limit execution rate
 * @param fn Function to throttle
 * @param interval Minimum interval between calls in milliseconds
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  interval: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= interval) {
      lastCall = now
      fn(...args)
    }
  }
}

/**
 * Memoize async function results with TTL
 */
export function createAsyncCache<T>(
  ttlMs: number = 5 * 60 * 1000,
): {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
  clear: () => void
} {
  const cache = new Map<string, { value: T; expiresAt: number }>()

  return {
    get(key: string) {
      const entry = cache.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.expiresAt) {
        cache.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key: string, value: T) {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    clear() {
      cache.clear()
    },
  }
}

/**
 * Request batching to combine multiple similar requests
 */
export function createBatcher<TRequest, TResponse>(
  batchFn: (requests: TRequest[]) => Promise<TResponse[]>,
  batchSize: number = 10,
  maxWaitMs: number = 100,
): {
  add: (request: TRequest) => Promise<TResponse>
  flush: () => void
} {
  let batch: Array<{
    request: TRequest
    resolve: (value: TResponse) => void
    reject: (reason?: unknown) => void
  }> = []
  let timeoutId: NodeJS.Timeout

  const flushBatch = async () => {
    if (batch.length === 0) return

    const currentBatch = batch
    batch = []
    clearTimeout(timeoutId)

    try {
      const results = await batchFn(currentBatch.map((b) => b.request))
      currentBatch.forEach((b, i) => {
        if (i < results.length) b.resolve(results[i])
      })
    } catch (error) {
      currentBatch.forEach((b) => b.reject(error))
    }
  }

  const scheduleBatch = () => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(flushBatch, maxWaitMs)
  }

  return {
    add(request: TRequest): Promise<TResponse> {
      return new Promise((resolve, reject) => {
        batch.push({ request, resolve, reject })

        if (batch.length >= batchSize) {
          void flushBatch()
        } else {
          scheduleBatch()
        }
      })
    },
    flush() {
      void flushBatch()
    },
  }
}

/**
 * Measure performance of an async operation
 */
export async function measurePerformance<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`)
    return result
  } catch (error) {
    const duration = performance.now() - start
    console.error(`[Performance] ${label}: ${duration.toFixed(2)}ms (failed)`)
    throw error
  }
}

/**
 * Request retry with exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries: number = 3,
  baseDelayMs: number = 100,
): Promise<Response> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", ...options })

      // Retry on 429 (rate limit) or 5xx errors
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error("Failed to fetch after retries")
}

/**
 * Virtual scroll helper - calculate visible items in a large list
 */
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalItems: number,
  bufferItems: number = 5,
): { start: number; end: number } {
  const visibleStart = Math.max(
    0,
    Math.floor(scrollTop / itemHeight) - bufferItems,
  )
  const visibleEnd = Math.min(
    totalItems,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferItems,
  )

  return { start: visibleStart, end: visibleEnd }
}

/**
 * Request deduplication - prevent identical concurrent requests
 */
export function createRequestDeduplicator(): {
  fetch: <T>(
    key: string,
    fn: () => Promise<T>,
  ) => Promise<T>
  clear: () => void
} {
  const inFlight = new Map<string, Promise<unknown>>()

  return {
    async fetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
      if (inFlight.has(key)) {
        return inFlight.get(key) as Promise<T>
      }

      const promise = fn()
      inFlight.set(key, promise)

      try {
        return await promise
      } finally {
        inFlight.delete(key)
      }
    },
    clear() {
      inFlight.clear()
    },
  }
}
