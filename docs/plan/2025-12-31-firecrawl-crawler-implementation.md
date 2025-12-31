# Firecrawl-based Crawler Implementation

**Date**: 2025-12-31  
**Status**: In Progress

## Problem

We need to crawl 115 tech blog posts from 7 companies and extract:
- Article content (markdown)
- Summary (Korean)
- Publish date
- Links

**Constraints:**
- 500 Firecrawl API requests/month budget
- JSON format uses 4 credits (too expensive)

## Solution

Use Firecrawl API with `rawHtml` format to extract publish dates via CSS selectors. Store scraped content in SQLite database (existing), and CSS selectors in JSON file.

## Architecture

### Data Flow

```
URLs (txt files) → Firecrawl API → Parse HTML → Extract Date → Save to DB
                                       ↓
                              CSS Selectors (JSON)
```

### Files Structure

```
crawler/
├── data/
│   ├── urls/              # Source: URLs to scrape (115 total)
│   │   ├── toss.txt       # 19 URLs
│   │   ├── kakao.txt      # 9 URLs
│   │   └── ...
│   ├── selectors.json     # CSS selectors per company
│   └── firecrawl/         # Saved API responses (JSON files)
├── src/
│   ├── index.ts           # CLI entry point
│   ├── selectors.ts       # Load selectors & parse dates
│   ├── scraper.ts         # NEW: Main scraping logic
│   └── db.ts              # Database schema (SQLite)
scripts/
├── test-firecrawl.ts          # Test Firecrawl API, save response
├── extract-pubdate-from-html.ts  # Find CSS selectors
└── extract-html-from-firecrawl.ts
```

## Implementation Details

### 1. Firecrawl API Configuration

**Request:**
```typescript
const result = await firecrawl.scrape(url, {
  formats: ['markdown', 'summary', 'links', 'rawHtml'],
  location: {
    country: 'KR',
    languages: ['ko'],
  },
});
```

**Response:**
```typescript
{
  markdown: string;      // 6.6 KB - main content
  summary: string;       // 425 chars - Korean summary
  links: string[];       // 6 URLs
  rawHtml: string;       // 253 KB - unmodified HTML
  metadata: {
    title: string;
    language: string;
    statusCode: number;
  };
}
```

**Cost:** 1 credit per URL

### 2. CSS Selectors Configuration

**File:** `crawler/data/selectors.json`

```json
{
  "toss": {
    "publishedDate": "#__next > div > div.p-container > ... > div.css-154r2lc",
    "publishedDateFormat": "YYYY년 MM월 DD일",
    "testUrl": "https://toss.tech/article/vulnerability-analysis-automation-1"
  },
  "kakao": {
    "publishedDate": "",
    "publishedDateFormat": "",
    "testUrl": ""
  }
}
```

**Usage:**
```typescript
import { extractPublishDateForCompany } from './selectors';

const date = extractPublishDateForCompany(rawHtml, 'toss');
// Returns: Date object or null
```

### 3. Publish Date Extraction

**Strategy:**
1. Load CSS selector from `selectors.json`
2. Use cheerio to parse `rawHtml`
3. Extract text content from selector
4. Parse date using multiple format patterns:
   - Korean: `2025년 12월 24일`
   - ISO: `2025-12-24`
   - English: `Dec 24, 2025`

**Implementation:** See `src/selectors.ts`

### 4. Database Schema

**Existing schema** (`src/db.ts`):
```typescript
{
  id: string;              // Hash of URL
  url: string;             // Source URL (unique)
  company: string;         // toss, kakao, etc.
  title: string;           // From Firecrawl metadata
  content: string;         // Markdown
  tags: string[];          // Future use
  publishedAt: Date;       // From CSS selector
  status: 'pending' | 'success' | 'failed';
  failedAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5. Scraping Logic

**Phase 1: Save to JSON files** (current)

```typescript
async function scrapeCompany(company: string): Promise<void> {
  const urls = loadUrls(company);
  const outputDir = `crawler/data/firecrawl/${company}`;
  
  for (const url of urls) {
    const id = generateId(url);
    const outputPath = `${outputDir}/${id}.json`;
    
    // 1. Skip if already scraped
    if (fs.existsSync(outputPath)) {
      console.log(`[SKIP] ${url}`);
      continue;
    }
    
    // 2. Scrape with Firecrawl
    const result = await firecrawl.scrape(url, {
      formats: ['markdown', 'summary', 'links', 'rawHtml'],
      location: { country: 'KR', languages: ['ko'] },
    });
    
    // 3. Save response to JSON file
    fs.writeFileSync(outputPath, JSON.stringify({
      url,
      company,
      scrapedAt: new Date().toISOString(),
      ...result,
    }, null, 2));
    
    console.log(`[SAVED] ${outputPath}`);
  }
}
```

**Phase 2: Process JSON → Database** (future)

After all selectors are working, process JSON files into SQLite.

## Implementation Steps

### Phase 1: CSS Selector Discovery (Current)

**Goal:** Find CSS selectors for all 7 companies

**Process:**
1. Pick one URL from each company's txt file
2. Run: `pnpm exec tsx scripts/test-firecrawl.ts [url]`
3. Analyze HTML: `pnpm exec tsx scripts/extract-pubdate-from-html.ts crawler/data/firecrawl/[id].json`
4. Find CSS selector (browser DevTools)
5. Update `crawler/data/selectors.json`

**Status:**
- [x] Toss - Done
- [ ] Kakao
- [ ] Naver
- [ ] Line
- [ ] Daangn (Medium)
- [ ] Woowahan
- [ ] Coupang (Medium)

### Phase 2: Build Scraper (Save to JSON)

**File to create:** `crawler/src/scraper.ts`

```typescript
export async function scrapeCompany(company: string): Promise<void>
export async function scrapeAll(): Promise<void>
```

**CLI:** `pnpm --filter @postby/crawler start [company]`

**Output:** JSON files in `crawler/data/firecrawl/{company}/{id}.json`

**Error handling:** Simple retry (max 2 attempts). Firecrawl handles rate limiting.

### Phase 3: Process JSON → Database (Future)

After Phase 2 is complete and selectors are stable:
- Parse JSON files
- Extract publish dates using CSS selectors
- Insert into SQLite database

### Phase 4: Validation

- [ ] All 7 companies have valid selectors
- [ ] All 115 URLs scraped to JSON files
- [ ] Failed URLs logged with reasons

## Budget & Cost

| Activity | URLs | Credits/URL | Total Credits |
|----------|------|-------------|---------------|
| Selector testing (7 × 2) | 14 | 1 | 14 |
| Full scrape (all companies) | 115 | 1 | 115 |
| Future updates | ~50 | 1 | 50 |
| **Total** | **179** | **1** | **179** |

**Monthly budget:** 500 credits  
**Remaining:** 500 - 179 = **321 credits** ✅

## Testing Tools

1. **`scripts/test-firecrawl.ts`** - Test Firecrawl API, save response to JSON file
   ```bash
   pnpm exec tsx scripts/test-firecrawl.ts https://toss.tech/article/...
   ```

2. **`scripts/extract-pubdate-from-html.ts`** - Find CSS selectors from saved response
   ```bash
   pnpm exec tsx scripts/extract-pubdate-from-html.ts crawler/data/firecrawl/[id].json
   ```

## Next Actions

1. Complete selector mapping for 6 remaining companies
2. Implement `src/scraper.ts` with database integration
3. Test with all 115 URLs

## Notes

- Firecrawl handles rate limiting automatically
- `rawHtml` format required for CSS selector extraction
- Korean summary: `location: { country: 'KR', languages: ['ko'] }`
- Medium blogs (daangn, coupang) likely share selectors
- Selectors may break if blogs redesign

## Success Criteria

- All 7 companies scraped successfully
- All content stored in database
- <200 credits used
- Scraper can re-run safely (skips existing)
