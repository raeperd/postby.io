#!/usr/bin/env tsx

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts, type Post, type FirecrawlResponse } from '../crawler/src/db';
import { extractPublishDate as extractPublishDateWithSelector } from '../crawler/src/selectors';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs/promises';

const dbPath = path.join(process.cwd(), 'crawler/posts.db');
const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client, { schema: { posts } });

interface Statistics {
  total: number;
  processed: number;
  extracted: number;
  setNull: number;
  failed: number;
}

function extractPublishDateFromHtml(html: string): Date | null {
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (nextDataMatch) {
    try {
      const jsonData = JSON.parse(nextDataMatch[1]);
      const jsonStr = JSON.stringify(jsonData);
      const datePatterns = [
        /\"publishedTime\":\"([^\"]+)\"/,
        /\"publishedAt\":\"([^\"]+)\"/,
        /\"published_time\":\"([^\"]+)\"/,
        /\"date_published\":\"([^\"]+)\"/,
        /\"createdTime\":\"([^\"]+)\"/,
      ];

      for (const pattern of datePatterns) {
        const match = jsonStr.match(pattern);
        if (match) {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    } catch {
      // Continue to next strategy
    }
  }

  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
  for (const match of jsonLdMatches) {
    try {
      const jsonLd = JSON.parse(match[1]);
      if (jsonLd.datePublished) {
        const date = new Date(jsonLd.datePublished);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch {
      // Continue to next match
    }
  }

  const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/);
  if (timeMatch) {
    const date = new Date(timeMatch[1]);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  const metaPatterns = [
    /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/,
    /<meta[^>]*name="publish[^"]*"[^>]*content="([^"]+)"/,
    /<meta[^>]*name="date"[^>]*content="([^"]+)"/,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

function extractPublishDateFromHtmlWithCompany(html: string, company: string): Date | null {
  const dateFromStructured = extractPublishDateFromHtml(html);
  if (dateFromStructured) {
    return dateFromStructured;
  }

  const dateFromSelector = extractPublishDateWithSelector(html, company);
  if (dateFromSelector) {
    return dateFromSelector;
  }

  return null;
}

function isValidDate(date: Date): boolean {
  if (isNaN(date.getTime())) return false;

  const minDate = new Date('2000-01-01');
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);

  return date >= minDate && date <= maxDate;
}

function logProgress(stats: Statistics, post: Post, action: string): void {
  const percent = ((stats.processed / stats.total) * 100).toFixed(1);
  console.log(`[${stats.processed}/${stats.total} ${percent}%] ${post.company} - ${action}`);
}

async function processPost(post: Post, stats: Statistics, dryRun: boolean): Promise<void> {
  try {
    const firecrawlData = post.firecrawlData;
    if (!firecrawlData) {
      stats.failed++;
      logProgress(stats, post, 'ERROR: No firecrawlData in database');
      return;
    }

    const html = firecrawlData.rawHtml || firecrawlData.html;
    if (!html) {
      stats.failed++;
      logProgress(stats, post, 'ERROR: No HTML in firecrawlData');
      return;
    }

    const extractedDate = extractPublishDateFromHtmlWithCompany(html, post.company);

    if (extractedDate && isValidDate(extractedDate)) {
      if (!dryRun) {
        await db.update(posts)
          .set({
            publishedAt: extractedDate,
            updatedAt: new Date()
          })
          .where(eq(posts.id, post.id));
      }

      stats.extracted++;
      const newDate = extractedDate.toISOString().split('T')[0];
      logProgress(stats, post, `${dryRun ? '[DRY RUN] Would extract' : 'Extracted'} date: ${newDate}`);
    } else {
      if (!dryRun) {
        await db.update(posts)
          .set({
            publishedAt: null,
            updatedAt: new Date()
          })
          .where(eq(posts.id, post.id));
      }

      stats.setNull++;
      logProgress(stats, post, `${dryRun ? '[DRY RUN] Would set' : 'Set'} to NULL (extraction failed)`);
    }

  } catch (error) {
    stats.failed++;
    console.error(`[ERROR] ${post.company} - ${post.url}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    stats.processed++;
  }
}

function printSummary(stats: Statistics, elapsed: number): void {
  console.log('\n' + '='.repeat(70));
  console.log('RETRY FAILED DATES - SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total posts:           ${stats.total}`);
  console.log(`Processed:             ${stats.processed}`);
  console.log(`Extracted dates:       ${stats.extracted}`);
  console.log(`Set to NULL:           ${stats.setNull}`);
  console.log(`Failed:                ${stats.failed}`);
  console.log(`Elapsed time:          ${elapsed.toFixed(1)}s`);
  console.log('='.repeat(70));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('Retrying failed date extractions...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log();

  const manualReviewPath = path.join(process.cwd(), 'crawler/data/manual-review-dates.json');
  const manualReviewContent = await fs.readFile(manualReviewPath, 'utf-8');
  const manualReview = JSON.parse(manualReviewContent);

  const postIds = manualReview.posts.map((p: { id: string }) => p.id);
  console.log(`Found ${postIds.length} posts from manual review file\n`);

  const startTime = Date.now();

  const failedPosts: Post[] = [];
  for (const id of postIds) {
    const post = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (post.length > 0) {
      failedPosts.push(post[0]);
    }
  }

  const stats: Statistics = {
    total: failedPosts.length,
    processed: 0,
    extracted: 0,
    setNull: 0,
    failed: 0
  };

  for (const post of failedPosts) {
    await processPost(post, stats, dryRun);
  }

  const elapsed = (Date.now() - startTime) / 1000;

  printSummary(stats, elapsed);

  if (!dryRun && stats.failed === 0) {
    console.log('\n✅ Processing completed successfully!');
  } else if (stats.failed > 0) {
    console.log('\n❌ Processing had errors - please review');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Processing failed:', error);
  process.exit(1);
});
