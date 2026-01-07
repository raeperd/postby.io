# Migration Plan: File Storage → SQLite for Web Crawler

## Overview

Migrate web crawler from file-only storage to SQLite database while keeping file backups. Store complete Firecrawl responses as JSON columns for data preservation.

**User Requirements:**
- ✅ Single JSON column for entire Firecrawl response
- ✅ Import 38+ existing JSON files into database
- ✅ Keep file storage as backup alongside database (dual writes)

## Current State

- **Files**: 44 JSON files in `crawler/data/firecrawl/{company}/*.json`
  - toss: 20, kakao: 10, coupang: 9, daangn: 5, naver: 0
- **Database**: `posts.db` exists with schema in `crawler/src/db.ts`
- **Schema**: 10 columns with indexes (url, company, published_at, status)
- **Issue**: `publishedAt` is NOT NULL, must handle extraction failures

## Implementation Plan

### 1. Schema Changes (`crawler/src/db.ts`)

**Add JSON column and type definition:**

```typescript
// Add interface above schema definition (before line 8)
export interface FirecrawlResponse {
  url: string;
  company: string;
  scrapedAt: string;
  markdown: string;
  summary: string;
  links: string[];
  rawHtml: string;
  metadata: {
    title: string;
    language?: string;
    statusCode?: number;
  };
}

// Add to posts table schema (after line 30, before closing brace)
firecrawlData: text('firecrawl_data', { mode: 'json' })
  .$type<FirecrawlResponse>()
  .notNull(),
```

**Update Zod validation (lines 48-55):**

```typescript
export const insertPostSchema = createInsertSchema(posts, {
  id: z.string().min(1, 'ID is required'),
  url: z.url({ message: 'Must be a valid URL' }),
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).default([]),
  company: z.string().min(1, 'Company is required'),
  firecrawlData: z.object({
    url: z.string(),
    company: z.string(),
    scrapedAt: z.string(),
    markdown: z.string(),
    summary: z.string(),
    links: z.array(z.string()),
    rawHtml: z.string(),
    metadata: z.object({
      title: z.string(),
      language: z.string().optional(),
      statusCode: z.number().optional(),
    }),
  }),
});
```

**Apply schema changes:**
```bash
npx drizzle-kit push
```

### 2. Create Migration Script (`crawler/src/migrate.ts`)

**New file with these responsibilities:**

1. Read all JSON files from `data/firecrawl/{company}/*.json`
2. Extract `publishedAt` using `extractPublishDate(rawHtml, company)`
3. Skip URLs that already exist in database (idempotent)
4. **Skip files where publishedAt extraction fails** (preserves NOT NULL constraint)
5. Map fields: `metadata.title → title`, `markdown → content`
6. Insert with defaults: `tags: []`, `failedAttempts: 0`, `status: 'success'`

**Key implementation details:**

```typescript
import { db, posts } from './db';
import { extractPublishDate } from './selectors';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

function generateId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

// Main logic:
// 1. Discover all JSON files in data/firecrawl/
// 2. For each file:
//    - Parse JSON
//    - Check if URL exists in DB (skip if yes)
//    - Extract publishedAt from rawHtml
//    - If publishedAt is null, skip with warning (NOT NULL constraint)
//    - Insert into database
// 3. Report: inserted, skipped, failed counts
```

**Run command:**
```bash
tsx src/migrate.ts
```

### 3. Update Scraper (`crawler/src/scraper.ts`)

**Changes required:**

**Line 17-19: Export generateId function**
```typescript
export function generateId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}
```

**Add imports after line 6:**
```typescript
import { db, posts } from './db';
import { eq } from 'drizzle-orm';
import { extractPublishDate } from './selectors';
```

**Lines 78-94: Replace single file write with dual write**

```typescript
// Build firecrawl response object
const firecrawlData = {
  url,
  company,
  scrapedAt: new Date().toISOString(),
  ...result,
};

// 1. Write to file (primary backup)
fs.writeFileSync(
  outputPath,
  JSON.stringify(firecrawlData, null, 2),
  'utf-8'
);

// 2. Check if already in database
const existing = await db.select().from(posts)
  .where(eq(posts.url, url))
  .limit(1);

if (existing.length > 0) {
  console.log(`  ✓ SAVED FILE (${id}.json) | DB: exists`);
  scraped++;
  continue;
}

// 3. Extract publishedAt
const publishedAt = extractPublishDate(result.rawHtml, company);
if (!publishedAt) {
  console.log(`  ✓ SAVED FILE (${id}.json) | DB: SKIP (no publish date)`);
  scraped++;
  continue;
}

// 4. Insert to database
try {
  await db.insert(posts).values({
    id,
    url,
    company,
    title: result.metadata.title,
    content: result.markdown,
    tags: [],
    publishedAt,
    firecrawlData,
    failedAttempts: 0,
    status: 'success',
  });
  console.log(`  ✓ SAVED FILE (${id}.json) & DB`);
} catch (dbError) {
  console.log(`  ✓ SAVED FILE (${id}.json) | DB: FAILED (${dbError.message})`);
}

scraped++;
```

**Error handling strategy:**
- File write happens first (source of truth)
- DB write failure is non-blocking (logs error, continues)
- Missing publishedAt skips DB insert but keeps file

### 4. Testing & Validation

**Phase 1: Schema Update**
```bash
# Backup database
cp posts.db posts.db.backup

# Apply schema changes
npx drizzle-kit push

# Verify with Drizzle Studio
npx drizzle-kit studio
# Check: new column 'firecrawl_data' exists
```

**Phase 2: Migration**
```bash
# Run migration
tsx src/migrate.ts

# Expected output example:
#   [toss] Processing 20 files...
#   [toss] Inserted: 18, Skipped: 0, Failed: 2 (no publish date)
#   [kakao] Processing 10 files...
#   ...
#   Total: Inserted: 40, Skipped: 0, Failed: 4

# Verify in Drizzle Studio
npx drizzle-kit studio
# Check: Row count, firecrawlData populated, publishedAt values

# Test idempotency (should skip all)
tsx src/migrate.ts
# Expected: Inserted: 0, Skipped: 40
```

**Phase 3: Scraper Testing**
```bash
# Test with existing URLs (should skip)
tsx src/index.ts scrape toss
# Expected: "⊘ SKIP (already exists in file)"
# DB check won't run for skipped files

# Test with new URL
# Add new URL to data/urls/toss.txt
tsx src/index.ts scrape toss
# Expected: "✓ SAVED FILE & DB"

# Verify both file and DB entry exist
ls data/firecrawl/toss/
npx drizzle-kit studio
```

**Validation queries:**
```typescript
// Check count per company
SELECT company, COUNT(*) FROM posts GROUP BY company;

// Verify firecrawlData structure
SELECT firecrawl_data FROM posts LIMIT 1;

// Check publishedAt extraction
SELECT company, url, published_at FROM posts ORDER BY published_at;
```

## Critical Files

### Files to Create
- **`crawler/src/migrate.ts`** (new)
  - Migration script for 44 existing files
  - ~100-120 lines

### Files to Modify
- **`crawler/src/db.ts`** (lines 8-38, 48-55)
  - Add FirecrawlResponse interface (~15 lines)
  - Add firecrawlData column (~4 lines)
  - Update Zod schema (~15 lines)
  - Total: ~35 lines added

- **`crawler/src/scraper.ts`** (lines 17-19, 78-94)
  - Export generateId function (~3 lines)
  - Add DB imports (~3 lines)
  - Replace file write with dual write (~45 lines)
  - Total: ~50 lines modified

### Files Used (No Changes)
- **`crawler/src/selectors.ts`** - extractPublishDate function
- **`crawler/src/index.ts`** - CLI entry point
- **`crawler/drizzle.config.ts`** - Drizzle configuration

## Implementation Sequence

1. ✅ **Backup database**: `cp posts.db posts.db.backup`
2. **Update schema** (`db.ts`): Add interface, column, validation
3. **Push schema**: `npx drizzle-kit push`
4. **Create migration script** (`migrate.ts`)
5. **Run migration**: `tsx src/migrate.ts`
6. **Verify migration**: Drizzle Studio + query checks
7. **Update scraper** (`scraper.ts`): Export generateId, add dual write
8. **Test scraper**: Existing URLs (skip), new URL (dual write)
9. **Final validation**: File count = DB row count

## Key Design Decisions

### Why Single JSON Column?
- Preserves complete Firecrawl response (~250KB per article)
- No schema changes when Firecrawl adds fields
- SQLite JSON functions available for queries if needed

### Why Dual Writes (File + DB)?
- Files = backup/archive (user requirement)
- DB = structured queries and analysis
- File write first (source of truth)
- DB failure non-blocking (graceful degradation)

### Why Skip Missing publishedAt?
- `publishedAt` is NOT NULL in schema (required field)
- Can't insert without valid date
- File preserved for later retry if selectors updated
- Clear logging for tracking failures

### Why Check Existing URL in Scraper?
- Prevents duplicate INSERT errors
- Fast query (indexed url column)
- Idempotent scraping (safe to re-run)

## Known Issues & Notes

1. **Selectors typo**: Line 25 has "akao" instead of "kakao" (not blocking)
2. **publishedAt extraction may fail** for some companies if CSS selectors change
3. **Storage overhead**: Dual storage means 2x disk usage (acceptable per user)
4. **No transactions**: File I/O can't be rolled back, so DB uses best-effort

## Success Criteria

- ✅ 44 JSON files migrated (or fewer if publishedAt fails)
- ✅ New scrapes write to both file and DB
- ✅ Scraper logs clearly show file vs DB status
- ✅ Database queryable for company/date/title
- ✅ Files remain as backup archive
