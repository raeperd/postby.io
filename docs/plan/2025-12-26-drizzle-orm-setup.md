# Drizzle ORM Configuration Plan

**Scope:** Configure Drizzle ORM with SQLite (libsql) for crawler database persistence

---

## Executive Summary

Set up Drizzle ORM with libsql driver for the crawler project to:
- Persist blog post data in SQLite database (`posts.db`)
- Provide type-safe database operations with TypeScript
- Enable automatic JSON serialization for tags array
- Support future migration to remote Turso database
- Validate data with Zod schemas before insertion

**Design Philosophy:**
- Use `libsql` driver for future-proof local/remote database flexibility
- Automatic JSON handling for array fields (tags)
- JavaScript `Date` objects for timestamps via Drizzle's `mode: 'timestamp'`
- Zod validation before insertions (log and skip on errors)
- `db:push` workflow for rapid development (no migrations initially)
- Keep database operations inline (no helper functions)

---

## Project Context

### Current State
- Crawler skeleton implemented with URL discovery logic
- No database persistence (posts are logged but not saved)
- TypeScript project with pnpm workspace

### Goals
1. Add SQLite database layer using Drizzle ORM
2. Define posts schema with proper types and constraints
3. Enable type-safe database operations
4. Prepare for future content crawling with data persistence

### Related Plan
- Previous: `2025-12-26-crawler-skeleton-setup.md` (Phase 1 complete)
- This plan implements Phase 3 from the original architecture

---

## Architecture Design

### Directory Structure

```
crawler/
  src/
    db.ts               # Drizzle schema + database client initialization
    fetcher.ts           # (existing)
    parser.ts            # (existing)
    rules.ts             # (existing)
    index.ts             # (existing, will integrate DB later)
  drizzle.config.ts      # Drizzle Kit configuration
  posts.db               # SQLite database file (gitignored)
  package.json
  tsconfig.json
```

### Data Flow (Future Integration)

```
crawl(company)
  └─→ crawlPostList(rule)
      ├─→ For each discovered URL:
      │   ├─→ Check if URL exists in DB
      │   ├─→ If new: insert with status='pending'
      │   └─→ If exists: skip or update based on status
      │
      └─→ For each pending post:
          ├─→ fetchPage(url) - Get HTML
          ├─→ parsePostContent(html, rule) - Extract content
          ├─→ Validate with Zod schema
          ├─→ Insert/update in database (status='success')
          └─→ On error: log, skip, increment failedAttempts
```

---

## Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `drizzle-orm` | `^0.45.1` | ORM for type-safe database operations |
| `@libsql/client` | `^0.15.0` | libsql driver (local SQLite + remote Turso) |
| `zod` | `^3.24.1` | Runtime validation before insertions |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `drizzle-kit` | `^0.31.8` | Schema management CLI (push, studio, migrations) |
| `drizzle-zod` | `^0.8.0` | Auto-generate Zod schemas from Drizzle schemas |

### Installation Command

```bash
cd crawler
pnpm add drizzle-orm @libsql/client zod
pnpm add -D drizzle-kit drizzle-zod
```

---

## Database Schema

### Posts Table

| Column | SQLite Type | Drizzle Definition | Constraints |
|--------|-------------|-------------------|-------------|
| `id` | INTEGER | `integer().primaryKey({ autoIncrement: true })` | PRIMARY KEY |
| `url` | TEXT | `text().notNull().unique()` | NOT NULL, UNIQUE |
| `company` | TEXT | `text().notNull()` | NOT NULL |
| `title` | TEXT | `text().notNull()` | NOT NULL |
| `content` | TEXT | `text().notNull()` | NOT NULL |
| `tags` | TEXT (JSON) | `text({ mode: 'json' }).$type<string[]>()` | NOT NULL, DEFAULT '[]' |
| `publishedAt` | INTEGER | `integer({ mode: 'timestamp' })` | NOT NULL |
| `createdAt` | INTEGER | `integer({ mode: 'timestamp' })` | NOT NULL, DEFAULT now |
| `updatedAt` | INTEGER | `integer({ mode: 'timestamp' })` | NOT NULL, DEFAULT now |
| `failedAttempts` | INTEGER | `integer().default(0)` | NOT NULL, DEFAULT 0 |
| `status` | TEXT | `text({ enum: ['pending', 'success', 'failed'] })` | NOT NULL, DEFAULT 'pending' |

### Indexes

| Index Name | Column | Purpose |
|------------|--------|---------|
| `url_idx` | `url` | Fast URL lookups (unique also creates index) |
| `company_idx` | `company` | Filter posts by company |
| `status_idx` | `status` | Query pending/failed posts |
| `published_at_idx` | `publishedAt` | Sort by publish date |

---

## File Specifications

### drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: 'file:posts.db',
  },
  verbose: true,
  strict: true,
});
```

**Note:** Use `dialect: 'sqlite'` for local libsql files. Use `dialect: 'turso'` only for remote Turso databases.

### src/db.ts

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Schema definition
export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull().unique(),
    company: text('company').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    status: text('status', { enum: ['pending', 'success', 'failed'] })
      .notNull()
      .default('pending'),
  },
  (table) => [
    index('url_idx').on(table.url),
    index('company_idx').on(table.company),
    index('status_idx').on(table.status),
    index('published_at_idx').on(table.publishedAt),
  ]
);

// Database client
const client = createClient({ 
  url: 'file:posts.db'
});

export const db = drizzle(client, { schema: { posts } });

// Zod schemas for validation
export const selectPostSchema = createSelectSchema(posts);

export const insertPostSchema = createInsertSchema(posts, {
  url: (schema) => schema.url('Must be a valid URL'),
  title: (schema) => schema.min(1, 'Title is required').max(500, 'Title too long'),
  content: (schema) => schema.min(1, 'Content is required'),
  tags: (schema) => schema.default([]),
});

// TypeScript types
export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
```

---

## Package.json Updates

### Scripts to Add

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

### Script Descriptions

| Script | Command | Purpose |
|--------|---------|---------|
| `db:push` | `drizzle-kit push` | Push schema to database (no migrations) |
| `db:studio` | `drizzle-kit studio` | Open web UI to inspect database |
| `db:generate` | `drizzle-kit generate` | Generate migration files (future) |
| `db:migrate` | `drizzle-kit migrate` | Apply migrations (future) |

---

## Git Ignore Updates

Add to root `.gitignore`:

```gitignore
# SQLite database files
posts.db
posts.db-shm
posts.db-wal
```

---

## Usage Examples

### Insert with Validation

```typescript
import { db, insertPostSchema } from './db';
import { ZodError } from 'zod';

const postData = {
  url: 'https://d2.naver.com/helloworld/123',
  company: 'naver',
  title: 'My Post Title',
  content: '<p>Post content...</p>',
  tags: ['javascript', 'typescript'],
  publishedAt: new Date('2024-12-26'),
};

try {
  const validatedData = insertPostSchema.parse(postData);
  await db.insert(schema.posts).values(validatedData);
  console.log('Post inserted successfully');
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Validation failed:', error.errors);
    console.log('Skipping post:', postData.url);
  } else {
    throw error;
  }
}
```

### Check if Post Exists

```typescript
import { db } from './db';
import { eq } from 'drizzle-orm';

const existing = await db
  .select()
  .from(schema.posts)
  .where(eq(schema.posts.url, postUrl))
  .get();

if (existing?.status === 'success') {
  console.log('Post already crawled, skipping');
}
```

### Query Pending Posts

```typescript
import { db } from './db';
import { eq, lt, and } from 'drizzle-orm';

const pendingPosts = await db
  .select()
  .from(schema.posts)
  .where(
    and(
      eq(schema.posts.status, 'pending'),
      lt(schema.posts.failedAttempts, 3)
    )
  )
  .all();
```

---

## Key Design Decisions

### 1. libsql over better-sqlite3
- **Decision:** Use `@libsql/client` driver
- **Rationale:** Future-proof (supports local files + remote Turso), Drizzle's preferred driver, more ALTER support
- **Trade-off:** Slightly newer library vs more established better-sqlite3

### 2. Automatic JSON for Tags
- **Decision:** Use `mode: 'json'` for tags field
- **Rationale:** Drizzle handles serialization automatically, simpler than junction table
- **Trade-off:** Less flexible querying vs simplicity

### 3. Timestamp Mode for Dates
- **Decision:** Use `mode: 'timestamp'` (integer with Date conversion)
- **Rationale:** Automatic conversion between JavaScript Date and Unix timestamp
- **Trade-off:** Stored as integer (less human-readable in raw SQL)

### 4. createdAt/updatedAt Naming
- **Decision:** Use `createdAt`/`updatedAt` instead of `crawledAt`/`lastAttemptAt`
- **Rationale:** Standard database convention, more intuitive
- **Trade-off:** None, this is better

### 5. db:push over Migrations
- **Decision:** Use `db:push` for development
- **Rationale:** Faster iteration, simpler workflow
- **Trade-off:** No migration history (can add later)

### 6. Validate Before Insert
- **Decision:** Validate with Zod before database insert
- **Rationale:** Explicit, can see validation happening, follows user preference
- **Trade-off:** More code at insertion points vs centralized

### 7. Log and Skip on Validation Errors
- **Decision:** Log validation errors and continue crawling
- **Rationale:** Maximize data collection, fix issues later
- **Trade-off:** Silent failures vs hard stops

---

## Files to Create

### Checklist

- [x] `docs/plan/2025-12-26-drizzle-orm-setup.md` (this document)
- [ ] Install dependencies: `pnpm add drizzle-orm @libsql/client zod`
- [ ] Install dev dependencies: `pnpm add -D drizzle-kit drizzle-zod`
- [ ] Create `crawler/drizzle.config.ts`
- [ ] Create `crawler/src/db.ts`
- [ ] Update `crawler/package.json` with db scripts
- [ ] Update `.gitignore` with posts.db files
- [ ] Run `pnpm db:push` to create database
- [ ] Run `pnpm db:studio` to verify schema
- [ ] Run `pnpm type-check` to verify TypeScript

### File Sizes (Estimated)

- `drizzle.config.ts`: ~12 lines
- `src/db.ts`: ~55 lines
- **Total:** ~67 lines of new TypeScript

---

## Testing Strategy

### Immediate Verification
1. Run `pnpm db:push` - should create `posts.db`
2. Run `pnpm db:studio` - open web UI at localhost
3. Verify posts table shows 11 columns
4. Verify 4 indexes are created
5. Run `pnpm type-check` - no TypeScript errors

### Manual Testing (Optional)
1. Insert test row via Drizzle Studio
2. Query via code to verify types work
3. Test Zod validation with invalid data

---

## Success Criteria

### Phase Complete When:
- All dependencies installed successfully
- `posts.db` file created at crawler root
- `pnpm type-check` passes with no errors
- `pnpm db:studio` shows posts table with correct schema
- Posts table has 11 columns with correct types
- 4 indexes visible in Drizzle Studio
- Zod schemas export correctly

### Ready for Integration When:
- Schema verified and working
- All type exports (`Post`, `InsertPost`) available
- Validation schemas (`insertPostSchema`) ready for use

---

## Risks & Mitigations

### Risk: libsql version compatibility
**Mitigation:** Use specific version in package.json, test before upgrading

### Risk: Schema changes after data inserted
**Mitigation:** libsql supports many ALTER operations; can recreate DB during development

### Risk: JSON tags field query limitations
**Mitigation:** Tags are for display only; if complex queries needed, migrate to junction table

### Risk: Timestamp timezone issues
**Mitigation:** All timestamps stored as UTC; JavaScript Date handles conversion

### Risk: SQLite JSON mode compatibility
**Mitigation:** `mode: 'json'` for SQLite text columns requires drizzle-orm 0.36+; verify with actual insert/select test

---

## Future Enhancements

### Short Term (After This Plan)
- Integrate database operations into `src/index.ts`
- Implement insert/update flow for crawled posts
- Add retry logic using failedAttempts field

### Medium Term
- Add more indexes if query patterns emerge
- Consider adding `author`, `excerpt`, `imageUrl` fields
- Implement database seeding for testing

### Long Term
- Migrate to formal migrations for production
- Consider Turso for cloud deployment
- Add database backup strategy

---

## Appendix

### Related Files
- `crawler/package.json` - Package configuration
- `crawler/tsconfig.json` - TypeScript configuration
- `crawler/src/db.ts` - Database schema and client
- `crawler/src/index.ts` - Main orchestration (will integrate DB)
- `docs/plan/2025-12-26-crawler-skeleton-setup.md` - Previous architecture plan

### References
- Drizzle ORM SQLite docs: https://orm.drizzle.team/docs/get-started-sqlite
- Drizzle Zod integration: https://orm.drizzle.team/docs/zod
- libsql client: https://github.com/tursodatabase/libsql-client-ts

---

**Plan Status:** Ready for review and execution  
**Next Step:** Review plan, then execute implementation
