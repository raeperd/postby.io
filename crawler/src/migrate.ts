import { db, type InsertPost, type FirecrawlResponse } from './db';
import { posts } from './db';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractPublishDate } from './selectors';
import { urlToId } from '../../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFirecrawlFiles(company: string): string[] {
  const firecrawlDir = path.join(__dirname, '..', 'data', 'firecrawl', company);
  if (!fs.existsSync(firecrawlDir)) {
    return [];
  }
  return fs.readdirSync(firecrawlDir).filter(file => file.endsWith('.json'));
}

async function migrateCompany(company: string): Promise<{ imported: number; skipped: number; failed: number }> {
  console.log(`\nMigrating ${company}...`);

  const files = loadFirecrawlFiles(company);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(__dirname, '..', 'data', 'firecrawl', company, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const firecrawlData: FirecrawlResponse = JSON.parse(content);

      const id = urlToId(firecrawlData.url);

      // Check if already exists
      const existing = await db.select().from(posts).where(eq(posts.url, firecrawlData.url));
      if (existing.length > 0) {
        console.log(`  ⊘ SKIP ${file} (already exists)`);
        skipped++;
        continue;
      }

      // Extract publish date from rawHtml
      const publishedAt = extractPublishDate(firecrawlData.rawHtml, company, firecrawlData.url);
      if (!publishedAt) {
        console.log(`  ⚠ WARNING ${file}: Could not extract publish date, using current time`);
      }

      const post: InsertPost = {
        id,
        url: firecrawlData.url,
        company: firecrawlData.company,
        title: firecrawlData.metadata.title || 'Untitled',
        content: firecrawlData.markdown,
        tags: [],
        publishedAt: publishedAt || new Date(),
        firecrawlData,
      };

      await db.insert(posts).values(post);
      console.log(`  ✓ IMPORTED ${file}`);
      imported++;
    } catch (error) {
      console.log(`  ✗ FAILED ${file}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  return { imported, skipped, failed };
}

async function main(): Promise<void> {
  const companies = ['toss', 'coupang', 'daangn', 'kakao', 'naver', 'line', 'woowahan'];

  console.log('='.repeat(60));
  console.log('Starting migration of Firecrawl data to SQLite');
  console.log('='.repeat(60));

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const company of companies) {
    const result = await migrateCompany(company);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
    console.log(`  Imported: ${result.imported}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete!');
  console.log(`  Total imported: ${totalImported}`);
  console.log(`  Total skipped:  ${totalSkipped}`);
  console.log(`  Total failed:   ${totalFailed}`);
  console.log('='.repeat(60) + '\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
