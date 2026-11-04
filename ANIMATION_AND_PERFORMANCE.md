# Navigation Animations and Performance Optimization Guide

This guide explains the new animation system and performance optimizations added to the Recruitment ERP application.

## Overview

The app now includes:
- **Page transition animations** (fade, slide-up, slide-left, slide-right)
- **Smooth navigation transitions**
- **Performance optimizations** for faster page loads
- **Skeleton loading states**
- **Resource preloading**

## Animation Features

### 1. Available Animations

The app now supports four animation types:

- **fadeIn**: Subtle opacity transition (default)
- **slideInUp**: Content slides up from below
- **slideInLeft**: Content slides from left
- **slideInRight**: Content slides from right

### 2. CSS Animations (in `src/index.css`)

All animations are pre-defined with hardware acceleration:

```css
@keyframes fadeIn { /* 0.3s */ }
@keyframes slideInUp { /* 0.4s */ }
@keyframes slideInLeft { /* 0.35s */ }
@keyframes slideInRight { /* 0.35s */ }
@keyframes shimmer { /* Loading skeleton */ }
```

### 3. Using Page Transitions in Components

Import the `usePageTransition` hook:

```typescript
import { usePageTransition } from '@/hooks/usePageTransition';

export default function MyComponent() {
  const { animation, containerRef } = usePageTransition([currentView]);

  return (
    <div ref={containerRef} className={`page-content ${animation}`}>
      {/* Content */}
    </div>
  );
}
```

### 4. Using PageTransitionWrapper Component

For simpler cases, wrap your content:

```typescript
import PageTransitionWrapper from '@/components/PageTransitionWrapper';

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <PageTransitionWrapper 
      isLoading={isLoading}
      animationType="slideInUp"
    >
      {/* Content */}
    </PageTransitionWrapper>
  );
}
```

## Performance Optimizations

### 1. Available Utilities (`src/utils/performanceOptimization.ts`)

```typescript
// Debounce - Reduce function call frequency
debounce(handleSearch, 300)

// Throttle - Limit function execution
throttle(handleScroll, 16)

// RAF Throttle - Smooth animation frame throttling
rafThrottle(handleResize)

// Lazy Load Images
lazyLoadImage(imgElement)

// Preload Data
preloadData('/api/candidates?limit=50')

// Batch Updates
batchStateUpdates(newState, 50)

// Measure Web Vitals
measureWebVitals()

// Response Caching
const cache = new ResponseCache(5 * 60 * 1000); // 5 min TTL
cache.set('candidates', data);
const cached = cache.get('candidates');
```

### 2. Implementing Debounce

Use for search inputs, resize handlers:

```typescript
import { debounce } from '@/utils/performanceOptimization';

const handleSearch = debounce((query: string) => {
  // API call
}, 300);

<input onChange={(e) => handleSearch(e.target.value)} />
```

### 3. Implementing Throttle

Use for scroll events, window resize:

```typescript
import { throttle } from '@/utils/performanceOptimization';

const handleScroll = throttle(() => {
  // Calculate visible items
}, 16); // ~60fps

window.addEventListener('scroll', handleScroll);
```

### 4. Lazy Loading Images

```typescript
import { lazyLoadImage } from '@/utils/performanceOptimization';

useEffect(() => {
  const images = document.querySelectorAll('[data-src]');
  images.forEach(lazyLoadImage);
}, []);

// In JSX:
<img data-src="/image.jpg" alt="..." />
```

### 5. Response Caching

Cache API responses to reduce network requests:

```typescript
import { ResponseCache } from '@/utils/performanceOptimization';

const cache = new ResponseCache(5 * 60 * 1000); // 5 minutes

async function fetchCandidates() {
  const cached = cache.get('candidates');
  if (cached) return cached;

  const response = await fetch('/api/candidates');
  const data = await response.json();
  cache.set('candidates', data);
  return data;
}
```

## Reducing Motion

The app respects user preferences for reduced motion via `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  /* All animations disabled */
}
```

Users with accessibility settings enabled will see instant transitions instead of animations.

## Performance Monitoring

Track page load metrics in development:

```typescript
import { usePageLoadMetrics } from '@/hooks/usePageTransition';

export default function Dashboard() {
  usePageLoadMetrics('Dashboard');
  // Automatically logs load time to console
}
```

## Best Practices

### 1. Use Animations Appropriately
- Use `slideInUp` for modal/dialog appearances
- Use `slideInLeft` when navigating backwards
- Use `slideInRight` when navigating forwards
- Use `fadeIn` for subtle state changes

### 2. Optimize Data Loading
```typescript
// ✅ Good: Debounce search queries
const handleSearch = debounce(fetchResults, 300);

// ❌ Bad: Fetch on every keystroke
onChange={(e) => fetchResults(e.target.value)}
```

### 3. Cache Responses
```typescript
// ✅ Good: Cache frequently accessed data
const cache = new ResponseCache(10 * 60 * 1000);

// ❌ Bad: Fetch every time
const data = await fetch('/api/data');
```

### 4. Lazy Load Images
```typescript
// ✅ Good: Load images only when visible
<img data-src="/heavy-image.jpg" alt="..." />

// ❌ Bad: Load all images immediately
<img src="/heavy-image.jpg" alt="..." />
```

### 5. Handle Loading States
```typescript
// ✅ Good: Show skeleton while loading
<PageTransitionWrapper isLoading={isLoading}>
  <Content />
</PageTransitionWrapper>

// ❌ Bad: Abrupt content changes
{isLoading ? 'Loading...' : <Content />}
```

## Implementation Checklist

- [ ] Add animations to main view transitions
- [ ] Implement debounce/throttle for search and filters
- [ ] Add skeleton loaders for data-heavy sections
- [ ] Cache frequently accessed API responses
- [ ] Lazy load images in list views
- [ ] Monitor Core Web Vitals in production
- [ ] Test with reduced motion preferences enabled
- [ ] Profile performance with Chrome DevTools

## Performance Targets

- **First Contentful Paint (FCP)**: < 2s
- **Largest Contentful Paint (LCP)**: < 3s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Time to Interactive (TTI)**: < 5s

## Troubleshooting

### Animations Not Working
- Verify CSS is imported in `src/index.css`
- Check that `page-content` class is applied to container
- Ensure `animationType` prop matches CSS keyframe names

### Performance Issues Persist
- Profile with Chrome DevTools > Performance tab
- Check Network tab for slow API calls
- Use Lighthouse for automated performance audit
- Profile bundle size with `npm run build -- --analyze`

### Animation Conflicts
- Disable animations temporarily by removing class
- Use `prefers-reduced-motion` to detect accessibility settings
- Adjust animation duration if too fast/slow

## Further Optimization Options

1. **Code Splitting**: Split components into separate bundles
2. **Image Optimization**: Use WebP with fallbacks
3. **Data Pagination**: Limit results per page
4. **Virtual Scrolling**: For large lists (1000+ items)
5. **Service Workers**: Cache assets for offline support
6. **CSS-in-JS Optimization**: Minimize runtime CSS generation

## References

- [Web.dev Performance Guide](https://web.dev/performance/)
- [React Performance](https://react.dev/reference/react/memo)
- [CSS Animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations)
- [Web Vitals](https://web.dev/vitals/)
