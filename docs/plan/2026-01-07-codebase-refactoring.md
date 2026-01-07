# Codebase Refactoring Plan

**Date**: 2026-01-07
**Status**: Planned
**Priority**: Medium

## Overview

This plan addresses code duplication and maintainability issues identified during PR #7 review. The refactoring focuses on centralizing constants, optimizing database queries, and improving error handling.

## Issues Identified

### 1. Code Duplication - Companies List (4 locations)

**Current State:**
- `crawler/src/migrate.ts:76` - Companies array
- `crawler/src/scraper.ts:155` - Companies array
- `crawler/src/index.ts:81` - validCompanies array
- `crawler/src/index.ts:66` - Companies in error message string

**Problem:** Adding/removing companies requires updating 4 locations, prone to inconsistency.

### 2. Code Duplication - Company Domain Mapping

**Current State:**
- `scripts/retry-scrape.ts:21-29` - `getCompanyFromUrl()` function

**Problem:** Company-to-domain mapping logic is isolated in retry-scrape.ts and not reusable.

### 3. Database Query Inefficiency

**Current State:**
```typescript
// Both scraper.ts:61 and migrate.ts:39
const existing = await db.select().from(posts).where(eq(posts.url, url));
if (existing.length > 0) { ... }
```

**Problem:**
- Fetches all columns when only checking existence
- Duplicated pattern in multiple files

### 4. No Transaction Support in Migration

**Current State:**
`crawler/src/migrate.ts:29-69` - Migration runs without transactions

**Problem:** If migration fails halfway, database is in inconsistent state. No rollback mechanism.

### 5. Unused Database Fields

**Current State:**
- `status` field (db.ts:43-45) - Always 'pending', never updated
- `failedAttempts` field (db.ts:42) - Always 0, never incremented

**Problem:** Fields exist in schema but serve no purpose currently.

## Proposed Solutions

### Phase 1: Centralize Constants

**Create `crawler/src/constants.ts`:**

```typescript
export const COMPANIES = [
  'toss',
  'coupang',
  'daangn',
  'kakao',
  'naver',
  'line',
  'woowahan'
] as const;

export type Company = typeof COMPANIES[number];

export const COMPANY_DOMAINS: Record<Company, string> = {
  toss: 'toss.tech',
  coupang: 'medium.com/coupang',
  daangn: 'medium.com/daangn',
  kakao: 'tech.kakao.com',
  naver: 'd2.naver.com',
  line: 'techblog.lycorp.co.jp',
  woowahan: 'techblog.woowahan.com',
};

/**
 * Extract company from URL based on domain matching
 */
export function getCompanyFromUrl(url: string): Company {
  for (const [company, domain] of Object.entries(COMPANY_DOMAINS)) {
    if (url.includes(domain)) {
      return company as Company;
    }
  }
  throw new Error(`Unknown company for URL: ${url}`);
}
```

**Update files to use constants:**
- `crawler/src/migrate.ts` - Import `COMPANIES`
- `crawler/src/scraper.ts` - Import `COMPANIES`
- `crawler/src/index.ts` - Import `COMPANIES` for validation
- `scripts/retry-scrape.ts` - Import `getCompanyFromUrl()`

**Benefits:**
- Single source of truth
- Type safety with `Company` type
- Easy to add/remove companies
- Shared domain mapping logic

### Phase 2: Optimize Database Queries

**Create `crawler/src/db-helpers.ts`:**

```typescript
import { db, posts } from './db';
import { eq } from 'drizzle-orm';

/**
 * Check if URL already exists in database
 * Optimized to only fetch id column
 */
export async function urlExists(url: string): Promise<boolean> {
  const result = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.url, url))
    .limit(1);

  return result.length > 0;
}

/**
 * Get post by URL (for checking status, etc.)
 */
export async function getPostByUrl(url: string) {
  const result = await db
    .select()
    .from(posts)
    .where(eq(posts.url, url))
    .limit(1);

  return result[0] ?? null;
}
```

**Update usage:**
- `crawler/src/scraper.ts:61` - Use `urlExists(url)`
- `crawler/src/migrate.ts:39` - Use `urlExists(firecrawlData.url)`

**Benefits:**
- Only fetches necessary columns (performance)
- Consistent API across codebase
- Easier to add caching later

### Phase 3: Add Transaction Support to Migration

**Update `crawler/src/migrate.ts`:**

```typescript
async function migrateCompany(company: string): Promise<{...}> {
  console.log(`\nMigrating ${company}...`);

  const files = loadFirecrawlFiles(company);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  // Wrap in transaction for atomicity
  try {
    await db.transaction(async (tx) => {
      for (const file of files) {
        const filePath = path.join(__dirname, '..', 'data', 'firecrawl', company, file);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const firecrawlData: FirecrawlResponse = JSON.parse(content);

          // ... existing logic

          await tx.insert(posts).values(post);
          console.log(`  ✓ IMPORTED ${file}`);
          imported++;
        } catch (error) {
          console.log(`  ✗ FAILED ${file}: ${error instanceof Error ? error.message : String(error)}`);
          failed++;
          // Continue with other files, don't fail entire company migration
        }
      }
    });
  } catch (error) {
    console.error(`Transaction failed for ${company}:`, error);
    throw error;
  }

  return { imported, skipped, failed };
}
```

**Benefits:**
- Atomic operations per company
- Rollback on critical failures
- Database consistency guaranteed

### Phase 4: Handle Unused Fields

**Option A: Remove unused fields**

If `status` and `failedAttempts` are not needed:

1. Create migration to drop columns
2. Remove from schema in `db.ts`
3. Update validation schemas

**Option B: Implement field usage**

If fields should be used:

1. Update `scraper.ts` to set status on success/failure:
```typescript
// On success
status: 'success',

// On failure (add to error handling)
failedAttempts: (existingPost?.failedAttempts ?? 0) + 1,
status: failedAttempts >= 3 ? 'failed' : 'pending',
```

2. Update `migrate.ts` to set initial status:
```typescript
status: 'success', // Already scraped successfully
```

**Decision needed:** Discuss with team whether retry logic is needed.

## Implementation Order

1. **Phase 1**: Centralize constants (~30 min)
   - Low risk, high impact
   - Reduces maintenance burden immediately

2. **Phase 2**: Optimize queries (~20 min)
   - Low risk, performance improvement
   - Sets foundation for future caching

3. **Phase 3**: Add transactions (~40 min)
   - Medium risk, important for data integrity
   - Test thoroughly with rollback scenarios

4. **Phase 4**: Handle unused fields (~varies)
   - Requires decision: remove or implement
   - Can be done independently

## Testing Plan

### Phase 1 Testing
```bash
# Verify constants work
npx tsx src/index.ts scrape toss
npx tsx src/migrate.ts

# Verify retry-scrape uses shared logic
npx tsx scripts/retry-scrape.ts <url>
```

### Phase 2 Testing
```bash
# Test optimized queries
npx tsx src/index.ts scrape toss
sqlite3 posts.db "EXPLAIN QUERY PLAN SELECT * FROM posts WHERE url = '...'"
```

### Phase 3 Testing
```bash
# Test transaction rollback
# 1. Modify migration to throw error halfway
# 2. Run migration
# 3. Verify no partial data in DB
# 4. Fix error and re-run
# 5. Verify all data imported
```

### Phase 4 Testing
```bash
# If implementing status updates
npx tsx src/index.ts scrape toss
sqlite3 posts.db "SELECT status, failedAttempts FROM posts WHERE company='toss'"
```

## Rollback Plan

### Phase 1
- Revert constants.ts
- Restore original inline arrays

### Phase 2
- Revert db-helpers.ts
- Restore inline queries

### Phase 3
- Revert transaction wrapper
- Migration still works without transactions

### Phase 4
- Schema change requires database migration
- Keep backup before dropping columns

## Success Metrics

- [ ] Companies list in single location
- [ ] Company domain mapping reusable
- [ ] Database queries use `limit(1)` for existence checks
- [ ] Migration uses transactions
- [ ] Decision made on unused fields
- [ ] All tests pass
- [ ] No regression in scraping/migration functionality

## Dependencies

- None - all changes are internal refactoring
- No new external packages needed

## Notes

- This refactoring maintains backward compatibility
- No breaking changes to public APIs
- Can be implemented incrementally
- Each phase is independently valuable
