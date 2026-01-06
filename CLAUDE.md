# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A curation service for tech company engineering blog posts. The project consists of two main components:

1. **Frontend** - Astro-based static site for content display
2. **Crawler** - Node.js/TypeScript tool for discovering and scraping blog posts from Korean tech companies

## Tech Stack

- **Frontend**: Astro 5.x, Tailwind CSS v4, TypeScript
- **Crawler**: Node.js, TypeScript, Drizzle ORM, SQLite (LibSQL), Firecrawl API, Cheerio
- **Package Manager**: pnpm (v10.11.1)
- **Code Quality**: ESLint, Prettier

## Common Commands

### Frontend Development

```bash
# Development server at localhost:4321
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Linting and formatting
pnpm lint          # Check linting errors
pnpm lint:fix      # Auto-fix linting errors
pnpm format        # Format code with Prettier
pnpm format:check  # Check formatting without changes
```

### Crawler Development

```bash
cd crawler

# Run crawler commands
pnpm start discover <company>  # Discover post URLs from RSS/list pages
pnpm start scrape <company>    # Scrape articles using Firecrawl API
pnpm start scrape-all          # Scrape all companies

# Development with watch mode
pnpm dev

# Database operations
pnpm db:push      # Push schema changes to database
pnpm db:studio    # Open Drizzle Studio (database GUI)
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations

# Type checking and code quality
pnpm type-check   # TypeScript type checking without emitting
pnpm lint         # ESLint
pnpm lint:fix     # Auto-fix linting errors
pnpm format       # Prettier formatting
```

## Architecture

### Crawler Architecture

The crawler operates in two phases:

1. **Discovery Phase** (`discover` command)
   - Crawls blog list pages to discover article URLs
   - Uses company-specific parsing rules defined in `crawler/src/rules.ts`
   - Supports pagination with configurable selectors
   - Stores discovered URLs in `crawler/data/urls/<company>.txt`

2. **Scraping Phase** (`scrape` command)
   - Reads URLs from `data/urls/<company>.txt`
   - Uses Firecrawl API to extract article content, metadata, and publish dates
   - Stores raw scraped data as JSON files in `crawler/data/firecrawl/<company>/`
   - Generates URL-based IDs using SHA-256 hash (first 16 chars)
   - Skips already-scraped URLs automatically

### Database Schema

Located in `crawler/src/db.ts`. Uses Drizzle ORM with LibSQL (SQLite).

**Posts Table**:
- `id`: Text primary key (SHA-256 hash of URL)
- `url`: Unique URL of the blog post
- `company`: Company name (toss, coupang, daangn, kakao, naver, line, woowahan)
- `title`, `content`, `tags`: Post metadata
- `publishedAt`: Publication timestamp
- `createdAt`, `updatedAt`: Record timestamps
- `status`: Enum ('pending' | 'success' | 'failed')
- `failedAttempts`: Retry counter

Indexes on: `url`, `company`, `status`, `publishedAt`

### Parsing Rules System

Each company has a `ParsingRule` defined in `crawler/src/rules.ts`:

```typescript
{
  name: string;
  listUrl: string;
  listSelectors: {
    postLinks: string;      // CSS selector for post URLs
    nextPage?: string;      // Optional pagination selector
  };
  contentSelectors: {
    title: string;
    content: string;
    tags: string;
    publishedAt: string;
  };
}
```

### Key Modules

- `crawler/src/index.ts` - Main entry point with CLI commands
- `crawler/src/scraper.ts` - Firecrawl integration for content extraction
- `crawler/src/fetcher.ts` - HTTP fetching wrapper
- `crawler/src/parser.ts` - HTML parsing logic (TODO: implement Cheerio-based parsing)
- `crawler/src/cache.ts` - File-based HTML caching system with URL encoding
- `crawler/src/db.ts` - Database schema and Zod validation schemas
- `crawler/src/rules.ts` - Company-specific parsing rules

### Data Directory Structure

```
crawler/data/
├── urls/              # Discovered URLs (one file per company)
│   ├── toss.txt
│   ├── coupang.txt
│   └── ...
├── firecrawl/         # Scraped JSON data from Firecrawl API
│   ├── toss/
│   ├── coupang/
│   └── ...
├── html/              # Cached HTML pages (organized by hostname)
│   └── <hostname>/
│       └── <base64-url-id>.html
└── rss/               # RSS feed data
```

### Environment Configuration

Requires `.env` file in `crawler/` directory:

```bash
FIRECRAWL_API_KEY=<your-api-key>
```

### Supported Companies

- toss
- coupang
- daangn (당근마켓)
- kakao
- naver
- line
- woowahan (우아한형제들)

## Development Notes

### Adding a New Company

1. Add a new rule to `crawler/src/rules.ts` with appropriate selectors
2. Run discovery: `pnpm start discover <company>`
3. Review discovered URLs in `data/urls/<company>.txt`
4. Run scraper: `pnpm start scrape <company>`

### Cache System

The crawler includes a file-based caching system (`cache.ts`):
- URLs are encoded to Base64 URL-safe IDs (without scheme)
- Cache files stored in `data/html/<hostname>/<id>.html`
- Helper functions: `urlToId()`, `idToUrl()`, `getCachePath()`, `readCache()`, `writeCache()`

### Type Safety

- Drizzle schema exports Zod validation schemas
- `insertPostSchema` - Validates data before DB insertion
- `selectPostSchema` - Type-safe query results
- TypeScript strict mode enabled in both frontend and crawler

### Scripts Directory

Contains utility scripts for data analysis and debugging:
- `extract-html-from-firecrawl.ts` - Extract HTML from Firecrawl JSON
- `extract-pubdate-from-html.ts` - Parse publication dates from HTML
- `analyze-firecrawl-pubdate.ts` - Analyze Firecrawl date extraction
- `test-firecrawl.ts` - Test Firecrawl API integration

Run scripts with: `tsx scripts/<script-name>.ts`
