import Firecrawl from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, posts, type InsertPost, type FirecrawlResponse, urlToId } from './db';
import { eq } from 'drizzle-orm';
import { extractPublishDate } from './selectors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.FIRECRAWL_API_KEY) {
  throw new Error('FIRECRAWL_API_KEY not found in environment. Check pipeline/.env file.');
}

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

export const COMPANIES = ['toss', 'coupang', 'daangn', 'kakao', 'naver', 'line', 'woowahan'] as const;
export type Company = (typeof COMPANIES)[number];

function loadUrls(company: string): string[] {
  const urlsPath = path.join(__dirname, '..', 'data', 'urls', `${company}.txt`);
  if (!fs.existsSync(urlsPath)) {
    throw new Error(`URL file not found: ${urlsPath}`);
  }
  const content = fs.readFileSync(urlsPath, 'utf-8');
  return content.split('\n').filter(line => line.trim());
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function scrapeUrl(
  url: string,
  company: string,
  outputDir: string,
  index: number,
  total: number
): Promise<{ status: 'scraped' | 'skipped' | 'failed'; url: string; error?: string }> {
  const id = urlToId(url);
  const outputPath = path.join(outputDir, `${id}.json`);

  console.log(`[${index + 1}/${total}] ${url}`);

  // Check if already exists in database
  const existing = await db.select().from(posts).where(eq(posts.url, url));
  if (existing.length > 0) {
    console.log(`  ⊘ SKIP (already in DB)`);
    return { status: 'skipped', url };
  }

  try {
    const result = await withTimeout(
      firecrawl.scrape(url, {
        formats: ['markdown', 'summary', 'links', 'rawHtml'],
        location: {
          country: 'KR',
          languages: ['ko'],
        },
      }),
      180000,
      `Timeout after 180s for ${url}`
    );

    const firecrawlData: FirecrawlResponse = {
      url,
      company,
      scrapedAt: new Date().toISOString(),
      markdown: result.markdown ?? '',
      summary: result.summary ?? '',
      links: result.links ?? [],
      rawHtml: result.rawHtml ?? '',
      metadata: {
        title: result.metadata?.title ?? 'Untitled',
        language: result.metadata?.language,
        statusCode: result.metadata?.statusCode,
      },
    };

    // Write to file (backup)
    fs.writeFileSync(outputPath, JSON.stringify(firecrawlData, null, 2), 'utf-8');

    // Write to database
    const publishedAt = extractPublishDate(firecrawlData.rawHtml, company, url) || new Date();
    const post: InsertPost = {
      id,
      url,
      company,
      title: firecrawlData.metadata.title || 'Untitled',
      content: firecrawlData.markdown,
      tags: [],
      publishedAt,
      firecrawlData,
    };

    await db.insert(posts).values(post);

    console.log(`  ✓ SAVED (file + DB)`);
    return { status: 'scraped', url };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ FAILED: ${errorMsg}`);
    return { status: 'failed', url, error: errorMsg };
  }
}

export async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (item: T, index: number) => Promise<any>
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, idx) => processor(item, i + idx)));
    results.push(...batchResults);
  }
  return results;
}

export async function scrapeCompany(company: string, concurrency: number = 5): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting scrape for: ${company} (concurrency: ${concurrency})`);
  console.log(`${'='.repeat(60)}\n`);

  const urls = loadUrls(company);
  const outputDir = path.join(__dirname, '..', 'data', 'firecrawl', company);
  fs.mkdirSync(outputDir, { recursive: true });

  const results = await processBatch(urls, concurrency, (url, index) =>
    scrapeUrl(url, company, outputDir, index, urls.length)
  );

  const skipped = results.filter(r => r.status === 'skipped').length;
  const scraped = results.filter(r => r.status === 'scraped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results for ${company}:`);
  console.log(`  Scraped: ${scraped}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${urls.length}`);
  console.log(`${'='.repeat(60)}\n`);
}

export async function scrapeAll(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('Starting scrape for ALL companies');
  console.log('='.repeat(60));

  for (const company of COMPANIES) {
    await scrapeCompany(company);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✓ All companies scraped!');
  console.log('='.repeat(60) + '\n');
}
