# Crawler Architecture Setup Plan

**Scope:** Design and implement crawler package architecture with minimal interfaces

---

## Executive Summary

Set up a complete TypeScript crawler architecture within a pnpm monorepo that can:
- Discover blog post URLs from company engineering blogs via pagination
- Fetch and parse individual post content (title, content, tags, publish date)
- Store posts in SQLite database with incremental crawling support
- Handle retries for failed posts (max 3 attempts)
- Respect rate limits (3-second delay between requests)
- Support multiple companies via pluggable parsing rules

**Design Philosophy:**
- Minimal interfaces (only 2: `Post` and `ParsingRule`)
- No single-use helper types or functions
- Pure TypeScript implementation (no ORM or external libs initially)
- Return empty/mock results for unimplemented functions (fully executable skeleton)

---

## Project Context

### Current State
- Astro-based monorepo at `/Users/raeperd/Codes/raeperd/postby.io`
- pnpm workspace configured with `crawler` package
- Existing `crawler/package.json` with basic setup

### Goals
1. Create executable TypeScript crawler with clear architecture
2. Define all types and function signatures upfront
3. Allow implementations to be added incrementally
4. Ensure orchestration logic is complete and testable

---

## Architecture Design

### Directory Structure

```
crawler/
  src/
    index.ts              - Main orchestration + delay handling
    fetcher.ts            - HTTP fetching (returns mock HTML)
    parser.ts             - HTML parsing (returns empty/mock results)
    rules.ts              - Company parsing rules + ParsingRule interface
  package.json
  tsconfig.json
```

**Note:** Database implementation (`db.ts` and `posts.db`) is **skipped entirely** for this phase.

### Data Flow

```
CLI (tsx src/index.ts <company>)
  ↓
main() - Validate args
  ↓
crawl(company)
  └─→ Phase 1: crawlPostList(rule)
      ├─→ fetchPage(listUrl) - Get HTML
      ├─→ parsePostList(html, rule) - Extract URLs
      ├─→ Log discovered URLs (no database storage yet)
      └─→ Loop pagination until no more pages
```

**Note:** Phase 2 (content crawling) and all database operations are **skipped** for this skeleton implementation.

---

## Type Definitions

### Core Interface (Only 1!)

#### ParsingRule (rules.ts)
```typescript
export interface ParsingRule {
  name: string
  listUrl: string
  listSelectors: {
    postLinks: string      // CSS selector for post URLs
    nextPage?: string      // CSS selector for next page link
  }
  contentSelectors: {
    title: string          // CSS selector for title
    content: string        // CSS selector for content
    tags: string           // CSS selector for tags
    publishedAt: string    // CSS selector for publish date
  }
}
```

### Inline Types (No Additional Interfaces)
- Function return types use inline object types `{ field: type; ... }`
- No separate interfaces for `FetchResult`, `PostListResult`, `PostContentResult`, etc.
- **Post interface removed** - database functionality skipped for this phase

---

## Function Specifications

### fetcher.ts - HTTP Fetching

```typescript
async function fetchPage(
  url: string
): Promise<{ html: string; url: string; statusCode: number }>
  // TODO: Use native fetch() API
  // Returns: Mock HTML for now
```

### parser.ts - HTML Parsing

```typescript
function parsePostList(
  html: string, 
  rule: ParsingRule
): { postUrls: string[]; hasNextPage: boolean; nextPageUrl?: string }
  // TODO: Extract URLs and pagination
  // Returns: { postUrls: [], hasNextPage: false }

function parsePostContent(
  html: string, 
  rule: ParsingRule
): { title: string; content: string; tags: string[]; publishedAt: Date }
  // TODO: Extract post content
  // Returns: Mock data
```

### index.ts - Orchestration

```typescript
async function crawlPostList(rule: ParsingRule): Promise<string[]>
  // Fetch paginated list pages, return all discovered URLs

async function crawl(company: string): Promise<void>
  // Run crawlPostList and log discovered URLs

async function main(): Promise<void>
  // CLI entry point, validate args, run crawl
```

**Note:** `crawlPostContent()` and all database-related operations are **skipped** for this phase.

---

## Configuration Files

### package.json Setup

**Use pnpm commands to initialize and configure:**

```bash
# Initialize package.json
cd crawler
pnpm init

# Install dev dependencies
pnpm add -D tsx typescript

# Add scripts manually or via pnpm pkg
pnpm pkg set name="@postby/crawler"
pnpm pkg set version="0.0.1"
pnpm pkg set type="module"
pnpm pkg set private=true
pnpm pkg set scripts.start="tsx src/index.ts"
pnpm pkg set scripts.dev="tsx watch src/index.ts"
pnpm pkg set scripts.build="tsc"
pnpm pkg set scripts.type-check="tsc --noEmit"
```

**Resulting package.json:**
```json
{
  "name": "@postby/crawler",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Sample Data

### Initial Parsing Rule (Naver)

```typescript
export const rules: Record<string, ParsingRule> = {
  naver: {
    name: 'naver',
    listUrl: 'https://d2.naver.com/home',
    listSelectors: {
      postLinks: '.post-item a',
      nextPage: '.pagination .next'
    },
    contentSelectors: {
      title: 'h1.post-title',
      content: '.post-content',
      tags: '.post-tags a',
      publishedAt: 'time.published'
    }
  }
}
```

---

## Implementation Strategy

### Phase 1: Skeleton Setup (This Plan)
✅ Create all 7 files with types and empty/mock implementations  
✅ Ensure TypeScript compiles without errors  
✅ Verify full execution path works (no crashes)  
✅ Test CLI argument validation  

### Phase 2: Incremental Implementation (Future)
1. Implement `fetchPage()` - Add native fetch() calls
2. Implement `parsePostList()` - Return actual URLs from HTML
3. Test with real company blogs (list pages only)
4. Add more company rules (Coupang, Line, etc.)

### Phase 3: Database & Content Crawling (Future)
1. Design and implement database schema (db.ts)
2. Implement `parsePostContent()` - Add HTML parser
3. Implement content crawling logic (Phase 2 in crawl flow)
4. Add retry logic and state management

---

## Key Design Decisions

### 1. Static 3-Second Delay
- **Decision:** Fixed 3-second delay between requests
- **Rationale:** Simpler than random delays, respectful to servers
- **Implementation:** Inline `await new Promise(resolve => setTimeout(resolve, 3000))`

### 2. Continue on Errors
- **Decision:** Keep processing posts even if individual posts fail
- **Rationale:** Maximize data collection, retry failed posts later
- **Implementation:** Try-catch around each post, log errors, continue loop

### 3. Required Fields in Post
- **Decision:** `id`, `title`, `content`, `publishedAt`, `crawledAt` are required
- **Rationale:** Ensures complete data for display on website
- **Implementation:** TypeScript enforces at compile time

### 4. Tags as Required Field
- **Decision:** `tags: string[]` is required (can be empty array)
- **Rationale:** Every post should have tags field, even if no tags found
- **Implementation:** Parser returns `[]` if no tags found

### 5. Skip Database Implementation
- **Decision:** Skip all database operations for initial skeleton
- **Rationale:** Focus on crawling logic first, add persistence later
- **Implementation:** Only implement URL discovery (Phase 1), skip content crawling (Phase 2)

### 6. Minimal Interfaces
- **Decision:** Only 1 interface (`ParsingRule`) for this phase
- **Rationale:** Reduces complexity, uses inline types where possible
- **Implementation:** No helper types, inline object return types

---

## Expected Behavior

### Successful Execution (Mock Mode)
```bash
$ pnpm start naver

==================================================
Starting crawl for: naver
==================================================

Phase 1: Discovering post URLs...
Fetching list page 1: https://d2.naver.com/home
[FETCHER] fetchPage called for: https://d2.naver.com/home
[PARSER] parsePostList called for rule: naver
  Found 0 posts on page 1
  No more pages

Discovered 0 total post URLs

==================================================
Crawl complete for: naver
==================================================
```

**Note:** No database operations or content crawling in this skeleton.

### Error Cases
```bash
# No company argument
$ pnpm start
Usage: tsx src/index.ts <company>
Available companies: naver

# Unknown company
$ pnpm start unknown
Unknown company: unknown
Available companies: naver
```

---

## Files to Create

### Checklist
- [x] `docs/plan/2025-12-26-crawler-skeleton-setup.md` (this document)
- [ ] Initialize crawler package with `pnpm init`
- [ ] Install dependencies with `pnpm add -D tsx typescript`
- [ ] Configure package.json using `pnpm pkg set` commands
- [ ] `crawler/tsconfig.json` - TypeScript configuration
- [ ] `crawler/src/fetcher.ts` - Single fetchPage function
- [ ] `crawler/src/parser.ts` - parsePostList function only
- [ ] `crawler/src/rules.ts` - ParsingRule interface + Naver rule
- [ ] `crawler/src/index.ts` - Simplified orchestration (Phase 1 only)

### File Sizes (Estimated)
- `fetcher.ts`: ~15 lines
- `parser.ts`: ~20 lines
- `rules.ts`: ~35 lines
- `index.ts`: ~80 lines
- **Total:** ~150 lines of TypeScript

---

## Testing Strategy

### Skeleton Testing (Immediate)
1. Compile TypeScript: `pnpm build`
2. Type check: `pnpm type-check`
3. Run with valid company: `pnpm start naver`
4. Test invalid company: `pnpm start invalid`
5. Test no args: `pnpm start`

### Integration Testing (Future)
1. Test with mock HTML fixtures
2. Test pagination handling
3. Test with real company blogs (rate-limited)
4. Test database operations (when implemented)
5. Test retry logic (when implemented)

---

## Future Enhancements

### Short Term
- Implement actual HTTP fetching (fetchPage)
- Implement actual HTML parsing (parsePostList)
- Test with real company blog list pages
- Add more company rules (Coupang, Line, Kakao, Woowa Bros)

### Medium Term
- Implement database layer (db.ts with SQLite)
- Implement content parsing (parsePostContent)
- Add Phase 2: Content crawling with retry logic
- Add stats/summary after crawl

### Long Term
- Add GitHub Actions workflow for periodic crawling
- Consider ORM (Drizzle) if database operations become complex
- Add concurrent fetching with queue
- Add webhook notifications on new posts

---

## Questions & Decisions Log

### Q: Should we implement database now?
**A:** No, skip database entirely for this skeleton. Focus on URL discovery only.

### Q: Random or fixed delay?
**A:** Fixed 3 seconds for simplicity.

### Q: Empty results or throw errors?
**A:** Return empty/mock results so index.ts can execute fully.

### Q: How many interfaces?
**A:** Minimal - only `ParsingRule` for this phase.

### Q: What about content crawling?
**A:** Skipped for now. Only implement Phase 1 (URL discovery from list pages).

---

## Success Criteria

### Skeleton Complete When:
- ✅ Package initialized with `pnpm init` and dependencies installed
- ✅ All 5 source files created (tsconfig, fetcher, parser, rules, index)
- ✅ TypeScript compiles without errors (`pnpm build`)
- ✅ `pnpm start naver` executes fully without crashes
- ✅ All function signatures defined with proper types
- ✅ CLI validation works (args, company lookup)
- ✅ Phase 1 (URL discovery) flow is complete
- ✅ Logging shows execution path clearly

### Ready for Implementation When:
- ✅ Plan reviewed and approved
- ✅ Architecture questions resolved
- ✅ File structure finalized
- ✅ No breaking changes expected to interfaces

---

## Risks & Mitigations

### Risk: HTML structure changes on company blogs
**Mitigation:** Parsing rules are isolated in `rules.ts`, easy to update per company

### Risk: Rate limiting by company servers
**Mitigation:** 3-second delay, user-agent headers (future), respect robots.txt

### Risk: Incomplete URL extraction
**Mitigation:** Parsing rules are testable with HTML fixtures, can verify before implementing database

---

## Appendix

### Related Files
- `/Users/raeperd/Codes/raeperd/postby.io/README.md` - Project overview
- `/Users/raeperd/Codes/raeperd/postby.io/pnpm-workspace.yaml` - Monorepo config
- `/Users/raeperd/Codes/raeperd/postby.io/crawler/package.json` - Current crawler config

### References
- TypeScript handbook: https://www.typescriptlang.org/docs/
- Native Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

---

**Plan Status:** Ready for review and execution  
**Next Step:** Review plan, then execute file creation
