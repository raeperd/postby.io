# SHA-1 ID Migration Plan

**Date:** 2026-01-08
**Status:** Planning
**Author:** Claude Code

## Overview

Migrate from Base64 URL encoding to SHA-1 hashing (40 chars) for URL-to-ID generation to fix filesystem length limitations and align with industry standards.

## Current State Analysis

**Database IDs:** Base64 encoding (31-62 chars for short URLs, up to 258 chars for long URLs)
```
Example: dG9zcy50ZWNoL2FydGljbGUvcGF5bWVudHMtbGVnYWN5LTM (47 chars)
```

**Firecrawl JSON files:** 16-char hex IDs (inconsistent with database)
```
Example: 47bf9aa9c5c21614.json
```

**Note:** Database and Firecrawl files are already inconsistent. Firecrawl files are backup data only - the migration will focus on database IDs and future file naming.

## Problem Statement

Current `urlToId()` implementation uses Base64 encoding which creates IDs up to 258 characters long:
- **Exceeds filesystem limits** (255 chars max on most systems)
- **Breaks file operations** for long URLs (Medium/Korean URLs)
- **Not standard practice** in web crawling (Scrapy uses SHA-1)
- **Inconsistent with existing files** (database uses Base64, files use 16-char hex)

Example issue:
```
URL: https://medium.com/daangn/매번-다-퍼올-필요-없잖아-당근의-mongodb-cdc-구축기-302ae8a0dc23
Base64 ID: bWVkaXVtLmNvbS9kYWFuZ24v... (258 chars) ❌
SHA-1 ID: a1adfb391b39c4c4a276867543d68f51241b269b (40 chars) ✅
```

## Solution: SHA-1 Hashing

### Why SHA-1?

| Criteria | SHA-1 |
|----------|-------|
| ✅ **Industry standard** | Used by Scrapy, Git, GitHub |
| ✅ **Consistent length** | Always 40 hex characters |
| ✅ **Filesystem safe** | Far below 255 char limit |
| ✅ **No truncation** | Full hash = no arbitrary decisions |
| ✅ **Proven at scale** | Handles billions of URLs |
| ✅ **Fast** | Faster than SHA-256 |
| ✅ **Zero collisions** | For practical URL scales (<100M) |

### Implementation

```typescript
import { createHash } from 'node:crypto';

export function urlToId(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}
```

## Migration Strategy

### Phase 1: Update Code (Non-Breaking)

**Files to update:**
1. `crawler/src/cache.ts` - Update `urlToId()` implementation
2. `crawler/src/scraper.ts` - Already uses `urlToId()` (no change needed)
3. `scripts/retry-scrape.ts` - Already uses `urlToId()` (no change needed)

**Changes:**
```diff
// crawler/src/cache.ts
- import { Buffer } from 'node:buffer';
+ import { createHash } from 'node:crypto';

- export function urlToId(url: string): string {
-   const withoutScheme = url.replace(/^https?:\/\//, '');
-   return Buffer.from(withoutScheme).toString('base64')
-     .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
- }
+ export function urlToId(url: string): string {
+   const withoutScheme = url.replace(/^https?:\/\//, '');
+   return createHash('sha1').update(withoutScheme).digest('hex');
+ }

- export function idToUrl(id: string): string {
-   // Restore base64 padding and characters
-   const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
-   const padding = '='.repeat((4 - (base64.length % 4)) % 4);
-   const withoutScheme = Buffer.from(base64 + padding, 'base64').toString('utf-8');
-   return `https://${withoutScheme}`;
- }
+ // DELETE idToUrl() - unused in codebase, URL lookup via: SELECT url FROM posts WHERE id = ?
```

### Phase 2: Database Migration

**Current State:**
- ~121 posts in SQLite with Base64 IDs (31-62+ chars)
- IDs stored in `posts.id` (primary key)
- Firecrawl files use different 16-char hex IDs (already inconsistent, will not be renamed)

**Important:** SQLite doesn't allow direct primary key updates. The migration uses raw SQL with `UPDATE` which SQLite does support when there are no foreign key constraints.

**Migration Script:** `scripts/migrate-to-sha1.ts`

```typescript
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

// SHA-1 implementation (same as will be in cache.ts)
function urlToSha1(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

async function migrateToSHA1() {
  console.log('Starting SHA-1 ID migration...');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  const dbPath = path.join(process.cwd(), 'crawler/posts.db');
  const db = new Database(dbPath);

  // Get all posts
  const allPosts = db.prepare('SELECT id, url, company FROM posts').all() as {
    id: string;
    url: string;
    company: string;
  }[];
  console.log(`Found ${allPosts.length} posts to migrate\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  // Use transaction for atomicity
  const migrate = db.transaction(() => {
    for (const post of allPosts) {
      try {
        const newId = urlToSha1(post.url);
        const oldId = post.id;

        // Check if already SHA-1 format (40 hex chars)
        if (oldId.length === 40 && /^[0-9a-f]+$/.test(oldId)) {
          console.log(`⊘ SKIP: ${post.company} - Already SHA-1 format`);
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`[DRY RUN] Would migrate: ${post.company}`);
          console.log(`  Old ID: ${oldId} (${oldId.length} chars)`);
          console.log(`  New ID: ${newId} (40 chars)`);
          console.log(`  URL: ${post.url.substring(0, 60)}...\n`);
          migrated++;
          continue;
        }

        // Update primary key using raw SQL
        db.prepare('UPDATE posts SET id = ? WHERE url = ?').run(newId, post.url);

        console.log(`✓ MIGRATED: ${post.company}`);
        console.log(`  Old: ${oldId.substring(0, 30)}... (${oldId.length} chars)`);
        console.log(`  New: ${newId} (40 chars)\n`);
        migrated++;

      } catch (error) {
        console.error(`✗ ERROR: ${post.url}`);
        console.error(`  ${error}\n`);
        errors++;
        throw error; // Rollback transaction on any error
      }
    }
  });

  try {
    migrate();
    console.log('\n' + '='.repeat(60));
    console.log(`Migration Summary ${DRY_RUN ? '(DRY RUN)' : ''}:`);
    console.log(`  Total:    ${allPosts.length}`);
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Errors:   ${errors}`);
    console.log('='.repeat(60));

    if (!DRY_RUN && errors === 0) {
      console.log('\n✅ Migration completed successfully!');
    }
  } catch (error) {
    console.error('\n❌ Migration failed - all changes rolled back');
    throw error;
  } finally {
    db.close();
  }
}

migrateToSHA1().catch(console.error);
```

**Run migration:**
```bash
# Dry run first (no changes made)
pnpm exec tsx scripts/migrate-to-sha1.ts --dry-run

# Actual migration
pnpm exec tsx scripts/migrate-to-sha1.ts
```

### Phase 3: Data Integrity Verification

**Verification Script:** `scripts/verify-sha1-migration.ts`

```typescript
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'path';

function urlToSha1(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

async function verifyMigration() {
  const dbPath = path.join(process.cwd(), 'crawler/posts.db');
  const db = new Database(dbPath, { readonly: true });

  const allPosts = db.prepare('SELECT id, url, company FROM posts').all() as {
    id: string;
    url: string;
    company: string;
  }[];

  let valid = 0;
  let invalid = 0;

  for (const post of allPosts) {
    const expectedId = urlToSha1(post.url);

    // 1. Check ID matches SHA-1 of URL
    if (post.id !== expectedId) {
      console.log(`✗ ID mismatch: ${post.company}`);
      console.log(`  URL:      ${post.url}`);
      console.log(`  Expected: ${expectedId}`);
      console.log(`  Got:      ${post.id}\n`);
      invalid++;
      continue;
    }

    // 2. Check ID is valid SHA-1 format (40 hex chars)
    if (post.id.length !== 40 || !/^[0-9a-f]+$/.test(post.id)) {
      console.log(`✗ Invalid SHA-1 format: ${post.id}`);
      invalid++;
      continue;
    }

    valid++;
  }

  db.close();

  console.log('\n' + '='.repeat(60));
  console.log('Verification Results:');
  console.log(`  Valid:       ${valid}`);
  console.log(`  Invalid IDs: ${invalid}`);
  console.log(`  Total:       ${allPosts.length}`);
  console.log('='.repeat(60));

  // Note: Firecrawl files use different IDs (legacy 16-char hex)
  // and don't need to match database IDs - they're just backup data
  console.log('\nNote: Firecrawl JSON files retain their original filenames.');
  console.log('      Database IDs and file names are intentionally different.\n');

  if (invalid === 0) {
    console.log('✅ All database IDs verified as valid SHA-1 hashes!');
  } else {
    console.log('❌ Migration has issues - review logs above');
    process.exit(1);
  }
}

verifyMigration().catch(console.error);
```

**Run verification:**
```bash
pnpm exec tsx scripts/verify-sha1-migration.ts
```

### Phase 4: Cleanup

**Remove obsolete code:**
1. Delete `idToUrl()` function entirely (confirmed unused via grep)
2. Update `CLAUDE.md` - change "Base64 encoding" to "SHA-1 hash"
3. Update database schema comments in `crawler/src/db.ts`

## Migration Checklist

- [ ] **Phase 1: Code Update**
  - [ ] Update `crawler/src/cache.ts` with SHA-1 implementation
  - [ ] Delete `idToUrl()` function (unused)
  - [ ] Run TypeScript build: `pnpm type-check` (from crawler/)
  - [ ] Commit: `refactor: migrate urlToId to SHA-1 hashing`

- [ ] **Phase 2: Database Migration**
  - [ ] Create backup: `cp crawler/posts.db crawler/posts.db.backup-before-sha1`
  - [ ] Create migration script: `scripts/migrate-to-sha1.ts`
  - [ ] Install better-sqlite3 if needed: `pnpm add -D better-sqlite3 @types/better-sqlite3`
  - [ ] Dry-run: `pnpm exec tsx scripts/migrate-to-sha1.ts --dry-run`
  - [ ] Run migration: `pnpm exec tsx scripts/migrate-to-sha1.ts`

- [ ] **Phase 3: Verification**
  - [ ] Create verification script: `scripts/verify-sha1-migration.ts`
  - [ ] Run: `pnpm exec tsx scripts/verify-sha1-migration.ts`
  - [ ] Spot-check: `sqlite3 crawler/posts.db "SELECT id, LENGTH(id), url FROM posts LIMIT 5"`

- [ ] **Phase 4: Testing**
  - [ ] Scrape a new URL: `cd crawler && pnpm start scrape toss`
  - [ ] Verify new post has 40-char SHA-1 ID in database
  - [ ] Verify Firecrawl JSON file created with SHA-1 name

- [ ] **Phase 5: Documentation & Cleanup**
  - [ ] Update `CLAUDE.md` - change "Base64 encoding" to "SHA-1 hash"
  - [ ] Commit: `docs: update ID generation to SHA-1 in docs`

- [ ] **Phase 6: Deploy**
  - [ ] Push to main branch
  - [ ] Monitor first scrapes for any issues

## Rollback Plan

If migration fails:

1. **Restore database:**
   ```bash
   cp crawler/posts.db.backup-before-sha1 crawler/posts.db
   ```

2. **Revert code changes:**
   ```bash
   git revert <commit-hash>
   ```

3. **Restore Firecrawl files if needed:**
   - Manual restoration from filesystem backups
   - Or re-scrape affected URLs

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ID collision | Very Low | High | SHA-1 has 2^160 space, impossible at our scale |
| Data loss | Very Low | High | Create backup before migration |
| Script bugs | Medium | Low | Dry-run mode + verification script |

## Expected Outcomes

### Before Migration
```
Database ID: dG9zcy50ZWNoL2FydGljbGUvcGF5bWVudHMtbGVnYWN5LTM (47 chars, Base64)
Long URL ID: 258+ characters (breaks filesystem)
Status: ❌ Variable length, fails on long URLs
```

### After Migration
```
Database ID: a1adfb391b39c4c4a276867543d68f51241b269b (40 chars, SHA-1)
Long URL ID: a1adfb391b39c4c4a276867543d68f51241b269b (40 chars, SHA-1)
Status: ✅ Fixed length, works for all URLs
```

### Benefits
- ✅ **Fix filesystem errors** - No more "name too long" errors
- ✅ **Industry alignment** - Same as Scrapy, Git, GitHub
- ✅ **Predictable length** - Always exactly 40 chars
- ✅ **Simpler code** - No Base64 padding/encoding logic

## References

- [Scrapy URL Fingerprinting](https://docs.scrapy.org/en/latest/topics/item-pipeline.html) - Uses SHA-1
- [Git SHA-1](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) - Uses SHA-1 for object IDs
- [GitHub Short SHAs](https://docs.github.com/en/repositories) - Truncates SHA-1 to 7-40 chars
- Current implementation: `crawler/src/cache.ts`

## Next Steps

1. Create database backup: `cp crawler/posts.db crawler/posts.db.backup-before-sha1`
2. Update `crawler/src/cache.ts` with SHA-1 implementation
3. Run dry-run migration to preview changes
4. Execute migration and verify
5. Test with a new scrape
6. Commit and deploy

---

**Status:** Ready for implementation
