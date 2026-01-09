#!/usr/bin/env tsx

import { posts } from '../crawler/src/db';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'crawler/posts.db');
const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client, { schema: { posts } });

async function checkKakaoPost(url: string) {
  const result = await db.select().from(posts).where(eq(posts.url, url)).limit(1);
  if (result.length === 0) {
    console.log('Post not found');
    return;
  }

  const post = result[0];
  const html = post.firecrawlData.rawHtml;

  console.log(`\nChecking: ${url}`);
  console.log('='.repeat(80));

  // Check for data-v attribute spans
  const dataVMatch = html.match(/<span[^>]*data-v-[^>]*>(\d{4}\.\d{2}\.\d{2})<\/span>/);
  if (dataVMatch) {
    console.log('✓ Found date with data-v attribute:', dataVMatch[1]);
  } else {
    console.log('✗ No date with data-v attribute found');
  }

  // Extract wrap_tit section
  const wrapTitMatch = html.match(/<div class="wrap_tit">(.*?)<\/div>/s);
  if (wrapTitMatch) {
    console.log('\n✓ Found wrap_tit div');
    const spans = wrapTitMatch[1].match(/<span[^>]*>([^<]+)<\/span>/g);
    if (spans) {
      console.log(`  Total spans: ${spans.length}`);
      spans.forEach((span, i) => {
        const text = span.match(/>([^<]+)</)?.[1] || '';
        console.log(`  Span ${i + 1}: ${text.substring(0, 50)}`);
      });
    }
  } else {
    console.log('\n✗ No wrap_tit div found');
  }

  // Try to find any date pattern
  const anyDateMatch = html.match(/(\d{4}\.\d{2}\.\d{2})/);
  if (anyDateMatch) {
    console.log(`\n✓ Found date pattern somewhere: ${anyDateMatch[1]}`);
  }
}

async function main() {
  const failedUrls = [
    'https://tech.kakao.com/posts/802',
    'https://tech.kakao.com/posts/803',
    'https://tech.kakao.com/posts/797',
    'https://tech.kakao.com/posts/798',
  ];

  for (const url of failedUrls) {
    await checkKakaoPost(url);
  }
}

main().catch(console.error);
