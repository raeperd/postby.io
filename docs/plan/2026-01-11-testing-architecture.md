# Plan: Add Testing Architecture for Pipeline

## Overview

Add a minimal testing infrastructure to the `pipeline` directory using Vitest, with tests that use the existing SQLite database (`posts.db`) as the test data source.

## Decisions

- **Framework**: Vitest (native ESM/TypeScript support, minimal config)
- **Data source**: SQLite (`posts.db`) with `firecrawl_data.rawHtml`
- **Test location**: Colocated (`pipeline/src/*.test.ts`)
- **Coverage**: All 121 posts (no sampling)
- **Null handling**: Fail test if `published_at` is null

## Test Cases

1. **Published date extraction** - Verify `extractPublishDate()` correctly parses dates from HTML using company-specific selectors
2. **Title/content validation** - Verify posts have non-empty title and content fields

## Implementation Steps

### 1. Add Vitest dependency

**File**: `pipeline/package.json`

Add to devDependencies:
```json
"vitest": "^3.1.4"
```

Add test script:
```json
"test": "vitest run"
```

### 2. Create Vitest config

**File**: `pipeline/vitest.config.ts`

Minimal configuration with TypeScript support.

### 3. Create selector tests

**File**: `pipeline/src/selectors.test.ts`

Tests:
- Query all posts from `posts.db` grouped by company
- For each post, extract `rawHtml` from `firecrawl_data`
- Call `extractPublishDate(rawHtml, company, url)`
- Assert the returned Date is valid (not null, valid timestamp)

### 4. Create post validation tests

**File**: `pipeline/src/db.test.ts`

Tests:
- Query all posts from database
- Assert `title` is non-empty string
- Assert `content` is non-empty string
- Assert `firecrawl_data` contains required fields

## Files to Modify

| File | Action |
|------|--------|
| `pipeline/package.json` | Add vitest, test script |
| `pipeline/vitest.config.ts` | Create (new) |
| `pipeline/src/selectors.test.ts` | Create (new) |
| `pipeline/src/db.test.ts` | Create (new) |

## Verification

```bash
cd pipeline
pnpm install
pnpm type-check
pnpm lint
pnpm test
```

Expected: All tests pass using local SQLite data, no external API calls.
