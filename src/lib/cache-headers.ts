/**
 * HTTP Cache Headers for optimal browser caching
 * Based on HTTP RFC 7234
 */

export const CACHE_HEADERS = {
  /**
   * No caching - always fetch fresh (default for most APIs)
   * Use for: Real-time data, sensitive information
   */
  NO_CACHE: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },

  /**
   * Short-lived cache (1 minute)
   * Use for: Dashboard data, frequently changing content
   */
  SHORT_TERM: {
    "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
  },

  /**
   * Medium-lived cache (5 minutes)
   * Use for: Lists, filtered data
   */
  MEDIUM_TERM: {
    "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
  },

  /**
   * Long-lived cache (1 hour)
   * Use for: Static lists, reference data, settings
   */
  LONG_TERM: {
    "Cache-Control": "private, max-age=3600, stale-while-revalidate=7200",
  },

  /**
   * Very long-lived cache (1 day)
   * Use for: Configuration, company metadata
   */
  VERY_LONG_TERM: {
    "Cache-Control": "private, max-age=86400, stale-while-revalidate=172800",
  },

  /**
   * Immutable cache (1 year)
   * Use for: Versioned assets, logos with hash
   */
  IMMUTABLE: {
    "Cache-Control": "public, max-age=31536000, immutable",
  },
} as const

/**
 * Compression headers
 */
export const COMPRESSION_HEADERS = {
  "Content-Encoding": "gzip",
  "X-Content-Type-Options": "nosniff",
} as const

/**
 * Security headers
 */
export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
} as const

/**
 * Get appropriate cache headers based on data type
 */
export function getCacheHeaders(
  dataType:
    | "dashboard"
    | "list"
    | "settings"
    | "reference"
    | "search"
    | "profile"
    | "real-time"
    | "export",
) {
  switch (dataType) {
    case "dashboard":
      return CACHE_HEADERS.SHORT_TERM
    case "list":
      return CACHE_HEADERS.MEDIUM_TERM
    case "settings":
      return CACHE_HEADERS.LONG_TERM
    case "reference":
      return CACHE_HEADERS.VERY_LONG_TERM
    case "search":
      return CACHE_HEADERS.SHORT_TERM
    case "profile":
      return CACHE_HEADERS.MEDIUM_TERM
    case "real-time":
      return CACHE_HEADERS.NO_CACHE
    case "export":
      return CACHE_HEADERS.NO_CACHE
    default:
      return CACHE_HEADERS.NO_CACHE
  }
}

/**
 * ETag-based conditional requests helper
 */
export function createETagHelper() {
  const etags = new Map<string, string>()

  return {
    getIfNoneMatch(url: string): string | undefined {
      return etags.get(url)
    },
    setETag(url: string, etag: string) {
      etags.set(url, etag)
    },
    headers(url: string) {
      const etag = etags.get(url)
      return etag ? { "If-None-Match": etag } : {}
    },
  }
}
