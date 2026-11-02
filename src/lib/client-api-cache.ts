import { createSupabaseBrowserClient } from "./supabase/browser"

type CachedResponse = {
  body: string
  expiresAt: number
  headers: [string, string][]
  status: number
  statusText: string
}

type ClientApiCacheOptions = {
  scopeKey: string
  ttlMs: number
}

const cache = new Map<string, CachedResponse>()
const maximumEntries = 50
const maximumBodyLength = 1_000_000
const maximumTtlMs = 15_000
let lastUserId: string | null | undefined

function createResponse(entry: CachedResponse): Response {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  })
}

function cacheResponse(key: string, entry: CachedResponse) {
  cache.delete(key)
  cache.set(key, entry)

  while (cache.size > maximumEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

async function readBodyWithinLimit(response: Response): Promise<string | null> {
  const reader = response.clone().body?.getReader()
  if (!reader) {
    const body = await response.clone().text()
    return body.length <= maximumBodyLength ? body : null
  }

  const chunks: Uint8Array[] = []
  let totalLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalLength += value.byteLength
    if (totalLength > maximumBodyLength) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function fetchClientCached(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: ClientApiCacheOptions,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase()
  if (
    method !== "GET" ||
    !options.scopeKey ||
    options.ttlMs <= 0 ||
    typeof window === "undefined"
  ) {
    return fetch(input, init)
  }

  const requestUrl = new URL(
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input,
    window.location.origin,
  )

  if (
    requestUrl.origin !== window.location.origin ||
    !requestUrl.pathname.startsWith("/api/")
  ) {
    return fetch(input, init)
  }

  const {
    data: { session },
    error,
  } = await createSupabaseBrowserClient().auth.getSession()
  if (error) {
    console.warn("Unable to scope the short-lived API cache to the current user.", error)
    return fetch(input, init)
  }
  if (!session) {
    clearClientApiCache()
    return fetch(input, init)
  }
  if (lastUserId !== session.user.id) {
    cache.clear()
    lastUserId = session.user.id
  }

  const companyRouteKey =
    window.location.pathname.split("/").filter(Boolean)[0] ?? "root"
  const key = `${session.user.id}:${companyRouteKey}:${options.scopeKey}:${requestUrl.pathname}${requestUrl.search}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return createResponse(cached)
  }
  if (cached) cache.delete(key)

  const response = await fetch(input, init)
  const contentType = response.headers.get("content-type") ?? ""
  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (
    response.status !== 200 ||
    !contentType.toLowerCase().includes("application/json") ||
    response.headers.has("set-cookie") ||
    (contentLength > 0 && contentLength > maximumBodyLength)
  ) {
    return response
  }

  void readBodyWithinLimit(response)
    .then((body) => {
      if (body === null) return
      cacheResponse(key, {
        body,
        expiresAt: Date.now() + Math.min(options.ttlMs, maximumTtlMs),
        headers: Array.from(response.headers.entries()).filter(
          ([name]) =>
            ![
              "content-encoding",
              "content-length",
              "set-cookie",
              "transfer-encoding",
            ].includes(name.toLowerCase()),
        ),
        status: response.status,
        statusText: response.statusText,
      })
    })
    .catch((cacheError: unknown) => {
      console.warn("Unable to store a short-lived API response in memory.", cacheError)
    })

  return response
}

export function clearClientApiCache() {
  cache.clear()
  lastUserId = undefined
}
