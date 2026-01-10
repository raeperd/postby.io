# Pipeline Refactoring Plan

## Overview
Rename `crawler/` to `pipeline/` and update all references.

## Target Structure
```
pipeline/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── scraper.ts         # Scraping logic (unchanged)
│   ├── db.ts              # Schema + connection
│   └── selectors.ts       # Date extraction
├── data/
├── drizzle/
├── package.json           # @postby/pipeline
└── posts.db
```

## Implementation Steps

### Step 1: Rename Directory
```bash
mv crawler pipeline
```

### Step 2: Update pnpm-workspace.yaml
```yaml
packages:
  - 'pipeline'
```

### Step 3: Update pipeline/package.json
Change name from `@postby/crawler` to `@postby/pipeline`

### Step 4: Update Path Aliases

**tsconfig.json (root)**:
```json
"@pipeline/*": ["./pipeline/src/*"]
```

**astro.config.mjs**:
```javascript
'@pipeline': './pipeline/src'
```

### Step 5: Update src/lib/db.ts
- Change database path: `./crawler/posts.db` → `./pipeline/posts.db`
- Change import: `@crawler/db` → `@pipeline/db`

### Step 6: Update scripts/*.ts
Update imports from `../crawler/src/` to `../pipeline/src/`

## Files to Modify

| File | Change |
|------|--------|
| `pnpm-workspace.yaml` | `crawler` → `pipeline` |
| `pipeline/package.json` | name → `@postby/pipeline` |
| `tsconfig.json` | `@crawler/*` → `@pipeline/*` |
| `astro.config.mjs` | `@crawler` → `@pipeline` |
| `src/lib/db.ts` | path + imports |
| `scripts/retry-scrape.ts` | imports |
| `scripts/test-date-selectors.ts` | imports |
| `scripts/test-firecrawl.ts` | imports |

## Verification
```bash
pnpm install
pnpm build
cd pipeline && pnpm start scrape toss
pnpm dev
```

## Future Work
- Add stage abstraction for modular processing (stages.ts, runner.ts)
- Add processing steps: title cleanup, content normalization, summary generation
