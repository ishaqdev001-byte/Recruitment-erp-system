/**
 * Virtual scrolling hooks for optimized rendering of large lists
 * Improves performance by only rendering visible items
 */

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Virtual scroll hook configuration
 */
interface VirtualScrollConfig {
  /** Height of the scroll container in pixels */
  containerHeight: number
  /** Height of each item in pixels */
  itemHeight: number
  /** Total number of items to render */
  totalItems: number
  /** Additional buffer items to render outside viewport (default: 5) */
  bufferSize?: number
  /** Callback when scroll position changes */
  onScroll?: (startIndex: number, endIndex: number) => void
}

/**
 * Virtual scroll state
 */
interface VirtualScrollState {
  /** Index of first visible item */
  startIndex: number
  /** Index of last visible item */
  endIndex: number
  /** Offset position in pixels */
  offset: number
  /** Height of total scrollable content */
  totalHeight: number
  /** Number of visible items + buffer */
  visibleItemCount: number
}

/**
 * Hook for managing virtual scrolling
 * Returns the range of items that should be rendered
 *
 * @example
 * const { startIndex, endIndex, offset } = useVirtualScroll({
 *   containerHeight: 600,
 *   itemHeight: 50,
 *   totalItems: 10000,
 * })
 *
 * return (
 *   <div style={{ height: 600, overflow: 'auto' }} ref={containerRef}>
 *     <div style={{ height: startIndex * itemHeight }}>
 *     {items.slice(startIndex, endIndex).map(item => (
 *       <div key={item.id} style={{ height: itemHeight }}>
 *         {item.name}
 *       </div>
 *     ))}
 *     <div style={{ height: (totalItems - endIndex) * itemHeight }}>
 *   </div>
 * )
 */
export function useVirtualScroll(config: VirtualScrollConfig): VirtualScrollState {
  const {
    containerHeight,
    itemHeight,
    totalItems,
    bufferSize = 5,
    onScroll,
  } = config

  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<VirtualScrollState>(() => {
    const visibleItemCount = Math.ceil(containerHeight / itemHeight) + bufferSize
    return {
      startIndex: 0,
      endIndex: Math.min(visibleItemCount, totalItems),
      offset: 0,
      totalHeight: totalItems * itemHeight,
      visibleItemCount,
    }
  })

  const handleScroll = useCallback(
    (event: Event) => {
      const element = event.target as HTMLDivElement
      const scrollTop = element.scrollTop

      // Calculate visible range
      const visibleItemCount = Math.ceil(containerHeight / itemHeight) + bufferSize
      let startIndex = Math.floor(scrollTop / itemHeight) - Math.floor(bufferSize / 2)
      startIndex = Math.max(0, startIndex)

      let endIndex = startIndex + visibleItemCount
      endIndex = Math.min(endIndex, totalItems)

      setState((prev) => {
        // Only update if indices changed
        if (prev.startIndex === startIndex && prev.endIndex === endIndex) {
          return prev
        }

        return {
          startIndex,
          endIndex,
          offset: startIndex * itemHeight,
          totalHeight: totalItems * itemHeight,
          visibleItemCount,
        }
      })

      onScroll?.(startIndex, endIndex)
    },
    [containerHeight, itemHeight, totalItems, bufferSize, onScroll],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    element.addEventListener("scroll", handleScroll, { passive: true })
    return () => element.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  return state
}

/**
 * Hook for lazy loading with virtual scrolling
 * Loads more items when user scrolls near the end
 *
 * @example
 * const { items, isLoading, hasMore } = useVirtualLazyLoad({
 *   loadMore: fetchMoreItems,
 *   initialItems: [],
 * })
 */
interface VirtualLazyLoadConfig<T> {
  /** Initial items to display */
  initialItems: T[]
  /** Callback to load more items */
  loadMore: (offset: number, limit: number) => Promise<T[]>
  /** Number of items per page */
  pageSize?: number
  /** Scroll position threshold to trigger load (0-1, default: 0.8) */
  loadThreshold?: number
}

export function useVirtualLazyLoad<T>(config: VirtualLazyLoadConfig<T>) {
  const {
    initialItems = [],
    loadMore,
    pageSize = 50,
    loadThreshold = 0.8,
  } = config

  const [items, setItems] = useState<T[]>(initialItems)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)

  const handleLoadMore = useCallback(
    async (startIndex: number, endIndex: number) => {
      // Check if we should load more (user scrolled near the end)
      const scrollPosition = endIndex / items.length
      if (scrollPosition < loadThreshold || loadingRef.current || !hasMore) {
        return
      }

      loadingRef.current = true
      setIsLoading(true)

      try {
        const newItems = await loadMore(items.length, pageSize)
        if (newItems.length === 0) {
          setHasMore(false)
        } else {
          setItems((prev) => [...prev, ...newItems])
        }
      } catch (error) {
        console.error("Failed to load more items", error)
      } finally {
        loadingRef.current = false
        setIsLoading(false)
      }
    },
    [items.length, loadMore, pageSize, loadThreshold, hasMore],
  )

  return {
    items,
    isLoading,
    hasMore,
    handleLoadMore,
    setItems,
  }
}

/**
 * Hook for windowed list rendering with dynamic heights
 * Use when items have different heights
 *
 * @example
 * const { visibleItems, offset } = useVirtualWindowedList({
 *   items: allItems,
 *   containerHeight: 600,
 *   getItemHeight: (item) => item.height || 50,
 * })
 */
interface VirtualWindowedListConfig<T> {
  /** Items to virtualize */
  items: T[]
  /** Container height */
  containerHeight: number
  /** Function to get height of each item */
  getItemHeight: (item: T, index: number) => number
  /** Buffer size for pre-rendering */
  bufferSize?: number
}

export function useVirtualWindowedList<T>(
  config: VirtualWindowedListConfig<T>,
) {
  const { items, containerHeight, getItemHeight, bufferSize = 5 } = config

  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({
    startIndex: 0,
    endIndex: 10,
    offset: 0,
  })

  // Pre-calculate cumulative heights for quick lookup
  const cumulativeHeights = useRef<number[]>([])
  const totalHeight = useRef(0)

  useEffect(() => {
    cumulativeHeights.current = []
    let total = 0
    for (let i = 0; i < items.length; i++) {
      total += getItemHeight(items[i], i)
      cumulativeHeights.current.push(total)
    }
    totalHeight.current = total
  }, [items, getItemHeight])

  const handleScroll = useCallback(
    (event: Event) => {
      const element = event.target as HTMLDivElement
      const scrollTop = element.scrollTop

      // Binary search to find start index
      const heights = cumulativeHeights.current
      let startIndex = 0
      for (let i = 0; i < heights.length; i++) {
        if (heights[i] > scrollTop) {
          startIndex = Math.max(0, i - bufferSize)
          break
        }
      }

      // Find end index
      let endIndex = startIndex
      let accumulatedHeight = startIndex > 0 ? heights[startIndex - 1] : 0
      while (
        endIndex < items.length &&
        accumulatedHeight < scrollTop + containerHeight
      ) {
        accumulatedHeight = heights[endIndex]
        endIndex++
      }
      endIndex = Math.min(endIndex + bufferSize, items.length)

      const offset = startIndex > 0 ? heights[startIndex - 1] : 0

      setVisibleRange({
        startIndex,
        endIndex,
        offset,
      })
    },
    [items.length, containerHeight, bufferSize],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    element.addEventListener("scroll", handleScroll, { passive: true })
    return () => element.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  const visibleItems = items.slice(visibleRange.startIndex, visibleRange.endIndex)

  return {
    containerRef,
    visibleItems,
    offset: visibleRange.offset,
    startIndex: visibleRange.startIndex,
    endIndex: visibleRange.endIndex,
    totalHeight: totalHeight.current,
  }
}

/**
 * Hook for infinite scroll with Intersection Observer
 * More efficient for end-of-list detection
 *
 * @example
 * const { targetRef, isNearEnd } = useInfiniteScroll({
 *   onNearEnd: loadMoreItems,
 *   threshold: 0.1,
 * })
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} {...item} />)}
 *     <div ref={targetRef} />
 *   </div>
 * )
 */
interface InfiniteScrollConfig {
  /** Callback when user scrolls near end */
  onNearEnd: () => void | Promise<void>
  /** Intersection threshold (0-1) */
  threshold?: number
}

export function useInfiniteScroll(config: InfiniteScrollConfig) {
  const { onNearEnd, threshold = 0.1 } = config
  const targetRef = useRef<HTMLDivElement>(null)
  const [isNearEnd, setIsNearEnd] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearEnd(true)
          onNearEnd()
        } else {
          setIsNearEnd(false)
        }
      },
      { threshold },
    )

    const target = targetRef.current
    if (target) {
      observer.observe(target)
    }

    return () => {
      if (target) {
        observer.unobserve(target)
      }
    }
  }, [onNearEnd, threshold])

  return {
    targetRef,
    isNearEnd,
  }
}

/**
 * Hook for scroll position restoration
 * Restores scroll position when navigating back
 *
 * @example
 * const { containerRef } = useScrollRestoration("items-page")
 */
export function useScrollRestoration(key: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(0)

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        sessionStorage.setItem(
          `scroll-position-${key}`,
          String(containerRef.current.scrollTop),
        )
      }
    }
  }, [key])

  // Restore scroll position on mount
  useEffect(() => {
    const position = sessionStorage.getItem(`scroll-position-${key}`)
    if (position && containerRef.current) {
      containerRef.current.scrollTop = parseInt(position, 10)
    }
  }, [key])

  return { containerRef, positionRef }
}
