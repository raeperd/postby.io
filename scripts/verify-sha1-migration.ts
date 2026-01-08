#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts } from '../crawler/src/db';
import { sql } from 'drizzle-orm';
import path from 'node:path';

// Create database connection with explicit path
const dbPath = path.join(process.cwd(), 'crawler/posts.db');
const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client, { schema: { posts } });

function urlToSha1(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

async function verifyMigration() {
  const allPosts = await db.all<{ id: string; url: string; company: string }>(
    sql`SELECT id, url, company FROM posts`
  );

  let valid = 0;
  let invalid = 0;

  for (const post of allPosts) {
    const expectedId = urlToSha1(post.url);

    // 1. Check ID matches SHA-1 of URL
    if (post.id !== expectedId) {
      console.log(`✗ ID mismatch: ${post.company}`);
      console.log(`  URL:      ${post.url}`);
      console.log(`  Expected: ${expectedId}`);
      console.log(`  Got:      ${post.id}\n`);
      invalid++;
      continue;
    }

    // 2. Check ID is valid SHA-1 format (40 hex chars)
    if (post.id.length !== 40 || !/^[0-9a-f]+$/.test(post.id)) {
      console.log(`✗ Invalid SHA-1 format: ${post.id}`);
      invalid++;
      continue;
    }

    valid++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('Verification Results:');
  console.log(`  Valid:       ${valid}`);
  console.log(`  Invalid IDs: ${invalid}`);
  console.log(`  Total:       ${allPosts.length}`);
  console.log('='.repeat(60));

  // Note: Firecrawl files use different IDs (legacy 16-char hex)
  // and don't need to match database IDs - they're just backup data
  console.log('\nNote: Firecrawl JSON files retain their original filenames.');
  console.log('      Database IDs and file names are intentionally different.\n');

  if (invalid === 0) {
    console.log('✅ All database IDs verified as valid SHA-1 hashes!');
  } else {
    console.log('❌ Migration has issues - review logs above');
    process.exit(1);
  }
}

verifyMigration().catch((error) => {
  console.error('Verification failed:', error);
  process.exit(1);
});
