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

interface ManualReviewEntry {
  id: string;
  url: string;
  company: string;
  currentPublishedAt: string;
  reason: 'no_firecrawl_json' | 'no_html_field' | 'extraction_failed' | 'invalid_date';
  firecrawlPath: string;
}

interface Statistics {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  manualReview: number;
}

const manualReviews: ManualReviewEntry[] = [];

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

function shouldUpdateDate(current: Date, extracted: Date): boolean {
  const diffMs = Math.abs(current.getTime() - extracted.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 1;
}

function logProgress(stats: Statistics, post: Post, action: string): void {
  const percent = ((stats.processed / stats.total) * 100).toFixed(1);
  console.log(`[${stats.processed}/${stats.total} ${percent}%] ${post.company} - ${action}`);
}

async function processPost(post: Post, stats: Statistics, dryRun: boolean): Promise<void> {
  try {
    const firecrawlPath = path.join(
      process.cwd(),
      'crawler/data/firecrawl',
      post.company,
      `${post.id}.json`
    );

    let firecrawlData: FirecrawlResponse;
    try {
      const fileContent = await fs.readFile(firecrawlPath, 'utf-8');
      firecrawlData = JSON.parse(fileContent);
    } catch {
      if (post.firecrawlData) {
        firecrawlData = post.firecrawlData;
      } else {
        manualReviews.push({
          id: post.id,
          url: post.url,
          company: post.company,
          currentPublishedAt: post.publishedAt.toISOString(),
          reason: 'no_firecrawl_json',
          firecrawlPath
        });
        stats.manualReview++;
        logProgress(stats, post, 'Manual review (no Firecrawl JSON)');
        return;
      }
    }

    const html = firecrawlData.rawHtml || firecrawlData.html;
    if (!html) {
      manualReviews.push({
        id: post.id,
        url: post.url,
        company: post.company,
        currentPublishedAt: post.publishedAt.toISOString(),
        reason: 'no_html_field',
        firecrawlPath
      });
      stats.manualReview++;
      logProgress(stats, post, 'Manual review (no HTML field)');
      return;
    }

    const extractedDate = extractPublishDateFromHtmlWithCompany(html, post.company);
    if (!extractedDate) {
      manualReviews.push({
        id: post.id,
        url: post.url,
        company: post.company,
        currentPublishedAt: post.publishedAt.toISOString(),
        reason: 'extraction_failed',
        firecrawlPath
      });
      stats.manualReview++;
      logProgress(stats, post, 'Manual review (extraction failed)');
      return;
    }

    if (!isValidDate(extractedDate)) {
      manualReviews.push({
        id: post.id,
        url: post.url,
        company: post.company,
        currentPublishedAt: post.publishedAt.toISOString(),
        reason: 'invalid_date',
        firecrawlPath
      });
      stats.manualReview++;
      logProgress(stats, post, `Manual review (invalid date: ${extractedDate.toISOString()})`);
      return;
    }

    if (!shouldUpdateDate(post.publishedAt, extractedDate)) {
      stats.skipped++;
      logProgress(stats, post, 'Skipped (date matches)');
      return;
    }

    if (!dryRun) {
      await db.update(posts)
        .set({
          publishedAt: extractedDate,
          updatedAt: new Date()
        })
        .where(eq(posts.id, post.id));
    }

    stats.updated++;
    const oldDate = post.publishedAt.toISOString().split('T')[0];
    const newDate = extractedDate.toISOString().split('T')[0];
    logProgress(stats, post, `${dryRun ? '[DRY RUN] Would update' : 'Updated'} (${oldDate} -> ${newDate})`);

  } catch (error) {
    stats.failed++;
    console.error(`[ERROR] ${post.company} - ${post.url}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    stats.processed++;
  }
}

async function writeManualReviewFile(): Promise<void> {
  const outputPath = path.join(process.cwd(), 'crawler/data/manual-review-dates.json');
  const output = {
    generatedAt: new Date().toISOString(),
    totalReviews: manualReviews.length,
    posts: manualReviews
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nManual review file written: ${outputPath}`);
  console.log(`Total posts requiring review: ${manualReviews.length}`);
}

function printSummary(stats: Statistics, elapsed: number): void {
  console.log('\n' + '='.repeat(70));
  console.log('FIX PUBLISHED DATES - SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total posts:           ${stats.total}`);
  console.log(`Processed:             ${stats.processed}`);
  console.log(`Updated:               ${stats.updated}`);
  console.log(`Skipped (no change):   ${stats.skipped}`);
  console.log(`Failed:                ${stats.failed}`);
  console.log(`Manual review needed:  ${stats.manualReview}`);
  console.log(`Elapsed time:          ${elapsed.toFixed(1)}s`);
  console.log('='.repeat(70));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyArg = args.find(arg => arg.startsWith('--company='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));

  const company = companyArg?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('Starting published_at date fixing...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (company) console.log(`Company filter: ${company}`);
  if (limit) console.log(`Limit: ${limit} posts`);
  console.log();

  const startTime = Date.now();

  let allPosts: Post[];
  if (company) {
    allPosts = await db.select().from(posts).where(eq(posts.company, company));
  } else {
    allPosts = await db.select().from(posts);
  }

  const postsToProcess = limit ? allPosts.slice(0, limit) : allPosts;

  const stats: Statistics = {
    total: postsToProcess.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    manualReview: 0
  };

  console.log(`Found ${stats.total} posts to process\n`);

  for (const post of postsToProcess) {
    await processPost(post, stats, dryRun);
  }

  const elapsed = (Date.now() - startTime) / 1000;

  if (manualReviews.length > 0) {
    await writeManualReviewFile();
  }

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
