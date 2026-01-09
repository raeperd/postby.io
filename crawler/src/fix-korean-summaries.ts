import Firecrawl from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, posts, type Post, type FirecrawlResponse } from './db';
import { eq } from 'drizzle-orm';
import { urlToId } from '../../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.FIRECRAWL_API_KEY) {
  throw new Error('FIRECRAWL_API_KEY not found in environment. Check crawler/.env file.');
}

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

// Types
interface Options {
  dryRun: boolean;
  company?: string;
  force: boolean;
  concurrency: number;
  skipBackup: boolean;
}

interface RescrapeResult {
  status: 'success' | 'failed' | 'skipped';
  url: string;
  error?: string;
}

interface VerificationReport {
  totalPosts: number;
  koreanSummaries: number;
  englishSummaries: number;
  ambiguous: number;
  byCompany: Record<string, {
    total: number;
    korean: number;
    english: number;
    samples: Array<{ id: string; url: string; summaryPreview: string }>;
  }>;
}

// CLI argument parsing
function parseArgs(args: string[]): Options {
  const options: Options = {
    dryRun: false,
    force: false,
    concurrency: 3,
    skipBackup: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--company':
        options.company = args[++i];
        break;
      case '--force':
        options.force = true;
        break;
      case '--concurrency':
        options.concurrency = parseInt(args[++i], 10);
        break;
      case '--skip-backup':
        options.skipBackup = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

// Korean detection using Hangul Unicode range
function isKorean(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const koreanChars = text.match(/[\uAC00-\uD7A3]/g);
  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) return false;

  return koreanChars !== null && (koreanChars.length / totalChars) > 0.4;
}

// Database backup
function createBackup(dryRun: boolean): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dbPath = path.join(__dirname, '..', 'posts.db');
  const backupPath = path.join(__dirname, '..', `posts.db.backup-${timestamp}`);

  if (!dryRun) {
    fs.copyFileSync(dbPath, backupPath);
  }

  return backupPath;
}

// Query posts from database
async function queryPosts(company?: string): Promise<Post[]> {
  if (company) {
    return await db.select().from(posts).where(eq(posts.company, company));
  }
  return await db.select().from(posts);
}

// Timeout wrapper from scraper.ts
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// Retry logic with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`  Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Should not reach here');
}

// Re-scrape and update a single post
async function rescrapeAndUpdate(
  post: Post,
  index: number,
  total: number,
  dryRun: boolean
): Promise<RescrapeResult> {
  console.log(`[${index + 1}/${total}] ${post.url}`);
  console.log(`  Company: ${post.company}`);
  console.log(`  Current summary: ${post.firecrawlData.summary.substring(0, 100)}...`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would re-scrape with Korean prompt`);
    console.log(`  [DRY RUN] Would update database`);
    return { status: 'success', url: post.url };
  }

  try {
    const result = await withRetry(() => withTimeout(
      firecrawl.scrape(post.url, {
        formats: [
          'markdown',
          {
            type: 'json',
            prompt: '이 기술 블로그 글의 핵심 내용을 한국어로 2-3문장으로 요약해주세요. 독자의 관심을 끌 수 있도록 핵심 기술과 문제 해결 방법을 간결하게 설명하세요.',
            schema: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: '한국어로 작성된 2-3문장 요약'
                }
              },
              required: ['summary']
            }
          },
          'links',
          'rawHtml'
        ],
        location: {
          country: 'KR',
          languages: ['ko', 'ko-KR'],
        },
      }),
      180000,
      `Timeout after 180s for ${post.url}`
    ));

    // Extract the Korean summary from the JSON result
    const extractedData = result.json as { summary: string };
    const koreanSummary = extractedData?.summary || 'Summary not available';

    const newFirecrawlData: FirecrawlResponse = {
      url: post.url,
      company: post.company,
      scrapedAt: new Date().toISOString(),
      markdown: result.markdown,
      summary: koreanSummary,
      links: result.links || [],
      rawHtml: result.rawHtml,
      metadata: result.metadata || { title: 'Untitled' },
    };

    console.log(`  New summary: ${newFirecrawlData.summary}`);
    console.log(`  Korean: ${isKorean(newFirecrawlData.summary) ? 'YES ✓' : 'NO ✗'}`);

    await db.update(posts)
      .set({
        firecrawlData: newFirecrawlData,
        content: newFirecrawlData.markdown,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));
    console.log(`  ✓ UPDATED`);

    return { status: 'success', url: post.url };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ FAILED: ${errorMsg}`);
    return { status: 'failed', url: post.url, error: errorMsg };
  }
}

// Batch processing from scraper.ts
async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (item: T, index: number) => Promise<any>
): Promise<any[]> {
  const results: any[] = [];
  const BATCH_DELAY_MS = 2000;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, idx) => processor(item, i + idx)));
    results.push(...batchResults);

    // Delay between batches (except last)
    if (i + batchSize < items.length) {
      console.log(`\n[Pausing 2s between batches...]\n`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// Generate verification report
async function generateVerificationReport(): Promise<VerificationReport> {
  const allPosts = await db.select().from(posts);

  const report: VerificationReport = {
    totalPosts: allPosts.length,
    koreanSummaries: 0,
    englishSummaries: 0,
    ambiguous: 0,
    byCompany: {},
  };

  for (const post of allPosts) {
    const summary = post.firecrawlData.summary;
    const korean = isKorean(summary);

    if (korean) {
      report.koreanSummaries++;
    } else {
      report.englishSummaries++;
    }

    // By company
    if (!report.byCompany[post.company]) {
      report.byCompany[post.company] = {
        total: 0,
        korean: 0,
        english: 0,
        samples: [],
      };
    }

    report.byCompany[post.company].total++;
    if (korean) {
      report.byCompany[post.company].korean++;
    } else {
      report.byCompany[post.company].english++;
      // Add sample if English
      if (report.byCompany[post.company].samples.length < 3) {
        report.byCompany[post.company].samples.push({
          id: post.id,
          url: post.url,
          summaryPreview: summary.substring(0, 100),
        });
      }
    }
  }

  return report;
}

// Print verification report
function printVerificationReport(report: VerificationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('Verification Report');
  console.log('='.repeat(60));
  console.log(`Total Posts:      ${report.totalPosts}`);
  console.log(`Korean Summaries: ${report.koreanSummaries} (${Math.round(report.koreanSummaries / report.totalPosts * 100)}%)`);
  console.log(`English Summaries: ${report.englishSummaries} (${Math.round(report.englishSummaries / report.totalPosts * 100)}%)`);
  console.log('\nBy Company:');
  console.log('-'.repeat(60));

  for (const [company, stats] of Object.entries(report.byCompany)) {
    const percentage = Math.round(stats.korean / stats.total * 100);
    console.log(`${company.padEnd(15)} | ${stats.korean}/${stats.total} Korean (${percentage}%)`);

    if (stats.samples.length > 0) {
      console.log('  Problematic samples:');
      for (const sample of stats.samples) {
        console.log(`    - ${sample.url}`);
        console.log(`      "${sample.summaryPreview}..."`);
      }
    }
  }
  console.log('='.repeat(60));
}

// Main function
async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('='.repeat(60));
  console.log('Fix Korean Summaries in Firecrawl Database');
  console.log('='.repeat(60));
  console.log(`Options:`);
  console.log(`  Dry run: ${options.dryRun}`);
  console.log(`  Company: ${options.company || 'all'}`);
  console.log(`  Force: ${options.force}`);
  console.log(`  Concurrency: ${options.concurrency}`);
  console.log(`  Skip backup: ${options.skipBackup}`);
  console.log('='.repeat(60));

  // Phase 1: Backup
  if (!options.skipBackup) {
    console.log('\nPhase 1: Creating database backup...');
    const backupPath = createBackup(options.dryRun);
    console.log(`✓ Backup: ${backupPath}`);
  } else {
    console.log('\nPhase 1: Skipping backup (--skip-backup)');
  }

  // Phase 2: Query posts
  console.log('\nPhase 2: Querying posts...');
  const allPosts = await queryPosts(options.company);
  console.log(`Found ${allPosts.length} posts`);

  // Filter posts if not --force
  const postsToProcess = options.force
    ? allPosts
    : allPosts.filter(p => !isKorean(p.firecrawlData.summary));

  console.log(`Processing ${postsToProcess.length} posts (${allPosts.length - postsToProcess.length} already Korean)`);

  if (postsToProcess.length === 0) {
    console.log('\n✓ All posts already have Korean summaries!');
    return;
  }

  // Phase 3: Re-scrape and update
  console.log('\nPhase 3: Re-scraping with Korean summaries...');
  console.log(`Concurrency: ${options.concurrency}, Batch delay: 2s\n`);

  const results = await processBatch(
    postsToProcess,
    options.concurrency,
    (post, idx) => rescrapeAndUpdate(post, idx, postsToProcess.length, options.dryRun)
  );

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('\n' + '='.repeat(60));
  console.log('Re-scrape Results:');
  console.log(`  Success: ${succeeded}`);
  console.log(`  Failed:  ${failed}`);
  console.log('='.repeat(60));

  // Phase 4: Verification
  console.log('\nPhase 4: Verifying results...');
  const report = await generateVerificationReport();

  printVerificationReport(report);

  if (!options.dryRun) {
    const reportPath = path.join(__dirname, '..', 'verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report saved to: ${reportPath}`);
  }

  // Success check
  const successRate = report.koreanSummaries / report.totalPosts;
  if (successRate >= 0.95) {
    console.log('\n✓ SUCCESS: >95% of posts have Korean summaries!');
  } else {
    console.log(`\n⚠ WARNING: Only ${Math.round(successRate * 100)}% have Korean summaries (target: 95%)`);
    console.log('Consider re-running failed posts or investigating Firecrawl API parameters.');
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
