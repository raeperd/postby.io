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

const DRY_RUN = process.argv.includes('--dry-run');

// SHA-1 implementation (same as in cache.ts)
function urlToSha1(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

async function migrateToSHA1() {
  console.log('Starting SHA-1 ID migration...');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Get all posts
  const allPosts = await db.all<{ id: string; url: string; company: string }>(
    sql`SELECT id, url, company FROM posts`
  );
  console.log(`Found ${allPosts.length} posts to migrate\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of allPosts) {
    try {
      const newId = urlToSha1(post.url);
      const oldId = post.id;

      // Check if already SHA-1 format (40 hex chars)
      if (oldId.length === 40 && /^[0-9a-f]+$/.test(oldId)) {
        console.log(`⊘ SKIP: ${post.company} - Already SHA-1 format`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would migrate: ${post.company}`);
        console.log(`  Old ID: ${oldId} (${oldId.length} chars)`);
        console.log(`  New ID: ${newId} (40 chars)`);
        console.log(`  URL: ${post.url.substring(0, 60)}...\n`);
        migrated++;
        continue;
      }

      // Update primary key using raw SQL
      await db.run(sql`UPDATE posts SET id = ${newId} WHERE url = ${post.url}`);

      console.log(`✓ MIGRATED: ${post.company}`);
      console.log(`  Old: ${oldId.substring(0, 30)}... (${oldId.length} chars)`);
      console.log(`  New: ${newId} (40 chars)\n`);
      migrated++;
    } catch (error) {
      console.error(`✗ ERROR: ${post.url}`);
      console.error(`  ${error}\n`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Migration Summary ${DRY_RUN ? '(DRY RUN)' : ''}:`);
  console.log(`  Total:    ${allPosts.length}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log('='.repeat(60));

  if (!DRY_RUN && errors === 0) {
    console.log('\n✅ Migration completed successfully!');
  } else if (errors > 0) {
    console.log('\n❌ Migration had errors - please review');
    process.exit(1);
  }
}

migrateToSHA1().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
