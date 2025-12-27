# RSS Feed-based Crawler Architecture

**Date**: 2025-12-27  
**Status**: Planned

## Problem

Current architecture uses HTML scraping with complex per-company rules:

- Fragile HTML selectors that break when UI changes
- Pagination logic for list pages
- Per-company `listSelectors` configuration
- High maintenance overhead

RSS feeds already exist for all companies and provide standardized metadata.

## Solution

Replace HTML list scraping with RSS feed parsing for post discovery.

### Architecture

```
RSS Feed → Parse Items → Fetch Full Content → Store in DB
```

### Flow

1. **Fetch RSS feed** from company feed URL (e.g., `https://toss.tech/rss.xml`)
2. **Parse RSS items** → extract `url`, `title`, `publishedAt`, `description`
3. **Fetch full content** from each post URL
4. **Parse content** using existing `contentSelectors`
5. **Store** in database

## Implementation Plan

### 1. Update `rules.ts`

**Before:**

```ts
export interface ParsingRule {
  name: string;
  listUrl: string;  // HTML list page
  listSelectors: {  // Complex selectors
    postLinks: string;
    nextPage?: string;
  };
  contentSelectors: { ... };
}
```

**After:**

```ts
export interface ParsingRule {
  name: string;
  feedUrl: string; // RSS feed URL
  contentSelectors: {
    title: string;
    content: string;
    tags: string;
    publishedAt: string;
  };
}
```

**Companies to support:**

- coupang
- daangn
- kakao
- line
- naver
- toss
- woowahan

### 2. Add RSS Parser (`parser.ts`)

```ts
export interface RssItem {
  url: string;
  title: string;
  publishedAt: Date;
  description: string;
}

export function parseRssFeed(xml: string): RssItem[];
```

**Implementation:**

- Use `fast-xml-parser` (lightweight, zero dependencies)
- Parse standard RSS 2.0 format
- Extract: `<item>` → `<link>`, `<title>`, `<pubDate>`, `<description>`

### 3. Update Crawler (`index.ts`)

**Before:**

```ts
async function crawlPostList(rule: ParsingRule): Promise<string[]> {
  // Paginated HTML scraping
  // Complex next page logic
}
```

**After:**

```ts
async function crawl(company: string): Promise<void> {
  const rule = rules[company];

  // 1. Fetch RSS feed
  const rssResult = await fetchPage(rule.feedUrl);
  const items = parseRssFeed(rssResult.html);

  // 2. Fetch full content for each post
  for (const item of items) {
    const pageResult = await fetchPage(item.url);
    const content = parsePostContent(pageResult.html, rule);

    // 3. Store in DB
    await db.insert(posts).values({
      id: generateId(item.url),
      url: item.url,
      company,
      title: content.title,
      content: content.content,
      tags: content.tags,
      publishedAt: item.publishedAt,
    });
  }
}
```

### 4. Testing Strategy

**Development:**

- Use local XML files from `feeds/*.xml` for testing
- Fast iteration without network calls

**Production:**

- Fetch live RSS feeds from `feedUrl`

**Test helper:**

```ts
async function loadTestFeed(company: string): Promise<string> {
  return fs.readFileSync(`./feeds/${company}.xml`, 'utf-8');
}
```

## Benefits

| Aspect      | Before                               | After                    |
| ----------- | ------------------------------------ | ------------------------ |
| Discovery   | HTML scraping + pagination           | RSS parsing              |
| Selectors   | `listSelectors` + `contentSelectors` | Only `contentSelectors`  |
| Maintenance | High (breaks on UI changes)          | Low (RSS is stable)      |
| Speed       | Slow (multiple pages)                | Fast (single feed fetch) |
| Reliability | Fragile                              | Robust                   |

## Dependencies

**New:**

- `fast-xml-parser` (~50KB, zero dependencies)

**Removed:**

- Complex list page scraping logic
- Pagination handling

## Migration Path

1. Write RSS parser function
2. Update `rules.ts` with feed URLs
3. Replace `crawlPostList()` with RSS-based discovery
4. Keep `parsePostContent()` unchanged (still need full content)
5. Test with local XML files
6. Deploy with live feed fetching

## Notes

- RSS feeds contain recent posts (typically last 20-50 posts)
- For historical data, may need to keep old posts in DB
- Feed URLs can be extracted from `<atom:link>` in XML or defined manually
- Keep `fetchPage()` for full content retrieval
