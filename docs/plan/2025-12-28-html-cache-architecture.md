# HTML Cache Architecture

**Date**: 2025-12-28  
**Status**: Planned

## Problem

During service development and iteration, we need to:

- Test parser changes without re-crawling
- Inspect HTML locally for debugging
- Avoid hitting production servers repeatedly
- Speed up development workflow

Currently, every test run or code change requires fresh HTTP requests, which is:

- Slow (network latency)
- Unreliable (rate limits, timeouts)
- Inefficient (same content fetched multiple times)
- Potentially rude to target servers

Additionally, existing feeds are scattered in `src/feeds/*.xml` with no consistent organization pattern.

## Solution

Implement unified data storage architecture with:

- Centralized `data/` directory for all data files
- RSS feeds in `data/rss/` (git tracked)
- Cached HTML in `data/html/` (git ignored)
- Base64 URL encoding for deterministic, reversible IDs
- Simple read/write cache API

## Architecture

### Directory Structure

```
crawler/
  data/
    rss/                     # Git tracked (RSS feeds)
      naver.xml              # Company-based naming (simple)
      kakao.xml
      toss.xml
      line.xml
      woowahan.xml
      daangn.xml
      coupang.xml
    html/                    # Git ignored (cached HTML)
      tech.kakao.com/        # Hostname-based folders
        {base64-id}.html
        {base64-id}.html
      toss.tech/
        {base64-id}.html
      d2.naver.com/
        {base64-id}.html
```

### Design Rationale

**Why different naming for RSS vs HTML?**

| Type        | Structure                                | Reason                                            |
| ----------- | ---------------------------------------- | ------------------------------------------------- |
| RSS feeds   | Flat files: `data/rss/{company}.xml`     | One file per company, simple names are sufficient |
| Cached HTML | Nested: `data/html/{hostname}/{id}.html` | Many files per host, needs organization           |

**Why separate `rss/` and `html/` directories?**

- Clear git tracking: RSS tracked, HTML ignored
- Different access patterns: RSS manually curated, HTML auto-cached
- Easy maintenance: `rm -rf data/html/` to clear cache
- Type-first organization for easy grepping

### ID Generation

**Encoding Strategy:**

- Remove `https://` prefix from URL
- Base64 URL-safe encode the remainder
- Use as filename with `.html` extension

**Examples:**

| Original URL                        | Cache Path                                                       |
| ----------------------------------- | ---------------------------------------------------------------- |
| `https://tech.kakao.com/posts/123`  | `data/html/tech.kakao.com/dGVjaC5rYWthby5jb20vcG9zdHMvMTIz.html` |
| `https://toss.tech/article/my-post` | `data/html/toss.tech/dG9zcy50ZWNoL2FydGljbGUvbXktcG9zdA.html`    |

**Encoding Process:**

```
https://tech.kakao.com/posts/123
         ↓ (remove https://)
tech.kakao.com/posts/123
         ↓ (base64 encode)
dGVjaC5rYWthby5jb20vcG9zdHMvMTIz
```

**Decoding Process:**

```
dGVjaC5rYWthby5jb20vcG9zdHMvMTIz
         ↓ (base64 decode)
tech.kakao.com/posts/123
         ↓ (prepend https://)
https://tech.kakao.com/posts/123
```

### Why Base64?

| Method                | Pros                                                                                        | Cons                            |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| **Base64 URL-safe**   | ✅ Bidirectional<br>✅ Deterministic<br>✅ Filesystem-safe<br>✅ Handles all URL characters | Longer filenames (~32-40 chars) |
| Character replacement | Human-readable                                                                              | Edge cases, not guaranteed safe |
| Hash (SHA256)         | Very short                                                                                  | One-way only, can't recover URL |

### Why Files over SQLite?

**For now, prefer files:**

- ✅ Simple to implement
- ✅ Easy to inspect/grep manually
- ✅ Easy to delete selectively
- ✅ No additional dependencies
- ✅ Works with standard Unix tools

**SQLite migration later if needed for:**

- Metadata storage (cache timestamps, TTL)
- Advanced queries
- Cache statistics

## Implementation Plan

### 1. Create Data Directory Structure

Create the new directory structure:

```bash
mkdir -p crawler/data/rss
mkdir -p crawler/data/html
```

### 2. Move RSS Feeds

**Migration mapping:**

| Current Path             | New Path                |
| ------------------------ | ----------------------- |
| `src/feeds/naver.xml`    | `data/rss/naver.xml`    |
| `src/feeds/kakao.xml`    | `data/rss/kakao.xml`    |
| `src/feeds/toss.xml`     | `data/rss/toss.xml`     |
| `src/feeds/line.xml`     | `data/rss/line.xml`     |
| `src/feeds/woowahan.xml` | `data/rss/woowahan.xml` |
| `src/feeds/daangn.xml`   | `data/rss/daangn.xml`   |
| `src/feeds/coupang.xml`  | `data/rss/coupang.xml`  |

### 3. Update `.gitignore`

**File:** `crawler/.gitignore`

```gitignore
# Cached HTML files
data/html/
```

### 4. Update Cache Module

**File:** `crawler/src/cache.ts`

```typescript
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_ROOT = join(__dirname, '../data/html');

/**
 * Encode URL to Base64 URL-safe ID
 * Removes https:// prefix before encoding
 */
export function urlToId(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return Buffer.from(withoutScheme).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); // Remove padding
}

/**
 * Decode Base64 ID back to URL
 * Prepends https:// after decoding
 */
export function idToUrl(id: string): string {
  // Restore base64 padding and characters
  const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const withoutScheme = Buffer.from(base64 + padding, 'base64').toString('utf-8');
  return `https://${withoutScheme}`;
}

/**
 * Get cache file path for a URL
 * Example: https://tech.kakao.com/posts/123
 *   -> data/html/tech.kakao.com/dGVjaC5rYWthby5jb20vcG9zdHMvMTIz.html
 */
export function getCachePath(url: string): string {
  const hostname = new URL(url).hostname;
  const id = urlToId(url);
  return join(CACHE_ROOT, hostname, `${id}.html`);
}

/**
 * Read cached HTML for a URL
 * Returns null if cache miss
 */
export async function readCache(url: string): Promise<string | null> {
  const cachePath = getCachePath(url);
  try {
    await access(cachePath);
    return await readFile(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write HTML to cache for a URL
 * Creates directory structure if needed
 */
export async function writeCache(url: string, html: string): Promise<void> {
  const cachePath = getCachePath(url);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, html, 'utf-8');
}

/**
 * Check if URL is cached
 */
export async function isCached(url: string): Promise<boolean> {
  const cachePath = getCachePath(url);
  try {
    await access(cachePath);
    return true;
  } catch {
    return false;
  }
}
```

### 5. Clean Up Old Files

Remove old directories:

```bash
rm -rf crawler/src/feeds/
rm -rf crawler/.cache/
```

### 6. Integration Points

**Where cache will be used:**

1. **Fetcher (`fetcher.ts`)** - Check cache before HTTP request
2. **Tests** - Load cached HTML for parser testing
3. **Manual inspection** - Developers can grep `data/html/` for debugging

**Future integration (out of scope for this plan):**

```typescript
// Example usage in fetcher
export async function fetchPage(url: string, useCache = true): Promise<FetchResult> {
  // Try cache first
  if (useCache) {
    const cached = await readCache(url);
    if (cached) {
      return { url, html: cached, fromCache: true };
    }
  }

  // Fetch from network
  const response = await fetch(url);
  const html = await response.text();

  // Write to cache
  await writeCache(url, html);

  return { url, html, fromCache: false };
}
```

## Testing Strategy

### Unit Tests for Cache Module

**Test cases:**

1. **`urlToId()` / `idToUrl()` roundtrip**
   - Encode then decode returns original URL
   - Test with various URL patterns (paths, query params, special chars)

2. **`getCachePath()` correctness**
   - Returns correct directory structure
   - Hostname extraction works
   - Base64 ID generation

3. **`writeCache()` / `readCache()` roundtrip**
   - Write HTML then read returns same content
   - Creates directory structure
   - Cache miss returns null

4. **Filesystem safety**
   - No special characters in generated paths
   - Works with long URLs
   - Handles query parameters and fragments

### Integration Tests

1. **Cache workflow**
   - First fetch: network + write cache
   - Second fetch: cache hit, no network
   - Cache invalidation works

## Benefits

| Aspect            | Before                  | After                |
| ----------------- | ----------------------- | -------------------- |
| Development speed | Slow (network per test) | Fast (local cache)   |
| Reliability       | Flaky (network issues)  | Stable (local files) |
| Debugging         | Re-fetch to inspect     | Grep cached files    |
| Rate limiting     | Risk of hitting limits  | Safe local testing   |
| Iteration         | Expensive re-crawls     | Free parser changes  |

## File Structure

```
crawler/
  data/
    rss/               # MOVED: RSS feeds (git tracked)
      naver.xml
      kakao.xml
      toss.xml
      ...
    html/              # NEW: Git-ignored cache
      tech.kakao.com/
        *.html
      toss.tech/
        *.html
  src/
    cache.ts           # UPDATED: Use data/html/ path
  .gitignore           # UPDATED: Ignore data/html/
```

## Dependencies

**None** - Uses only Node.js built-ins:

- `node:fs/promises` - File operations
- `node:path` - Path manipulation
- `node:buffer` - Base64 encoding
- `node:url` - URL parsing

## Notes

### Design Decisions

1. **Always `https://` in decode** - Assume modern HTTPS-only web
2. **Hostname from URL object** - Standard parsing, handles edge cases
3. **URL-safe Base64** - Replace `+` → `-`, `/` → `_`, remove `=` padding
4. **No TTL/expiration** - Manual cache management for simplicity
5. **Synchronous structure** - Async I/O but simple linear flow

### Future Enhancements (Not in this plan)

- Cache invalidation strategy (TTL, manual purge)
- Cache statistics (hit rate, size)
- Compression (gzip cached HTML)
- Metadata storage (fetch timestamp, headers)
- Migration to SQLite if file count becomes unmanageable

### Edge Cases

- **Duplicate URLs with different schemes** - Normalized to `https://`
- **URLs with fragments** - Included in cache key
- **Very long URLs** - Base64 handles gracefully, filesystem limits ~255 chars
- **International domains** - URL encoding handles Unicode

## Migration Path

1. ✅ Create plan document (this file)
2. Create `crawler/data/rss/` and `crawler/data/html/` directories
3. Move RSS feeds from `src/feeds/*.xml` to `data/rss/*.xml`
4. Update `crawler/.gitignore` to ignore `data/html/`
5. Update `crawler/src/cache.ts` to use `data/html/` path
6. Remove old `src/feeds/` and `.cache/` directories
7. Verify git tracking: RSS tracked, HTML ignored

## Success Criteria

- ✅ Unified data directory structure created
- ✅ RSS feeds moved to `data/rss/*.xml`
- ✅ Cache module uses `data/html/{hostname}/{id}.html` path
- ✅ `urlToId()` / `idToUrl()` roundtrip works for all test URLs
- ✅ `writeCache()` / `readCache()` roundtrip works
- ✅ `data/html/` is git-ignored, `data/rss/` is tracked
- ✅ File structure matches design
- ✅ No external dependencies added
