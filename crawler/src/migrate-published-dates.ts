import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts } from './db';
import { eq, sql } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Migrating published_at dates from main branch...\n');

// Connect to main branch database
const mainClient = createClient({
  url: 'file:/tmp/posts-main.db',
});
const mainDb = drizzle(mainClient, { schema: { posts } });

// Connect to current database
const currentClient = createClient({
  url: 'file:posts.db',
});
const currentDb = drizzle(currentClient, { schema: { posts } });

// Get all posts with their published_at from main
const mainPosts = await mainDb.select({
  id: posts.id,
  url: posts.url,
  publishedAt: posts.publishedAt,
}).from(posts);

console.log(`Found ${mainPosts.length} posts in main branch`);

let updated = 0;
let notFound = 0;

// Update published_at in current database
for (const post of mainPosts) {
  // Skip if published_at is null in main
  if (!post.publishedAt) {
    console.log(`  ⚠️  Null published_at in main: ${post.url}`);
    continue;
  }

  const result = await currentDb.update(posts)
    .set({ publishedAt: post.publishedAt })
    .where(eq(posts.url, post.url));

  // Check if update was successful by querying
  const check = await currentDb.select({ id: posts.id })
    .from(posts)
    .where(eq(posts.url, post.url));

  if (check.length > 0) {
    updated++;
    if (updated % 20 === 0) {
      console.log(`  Progress: ${updated}/${mainPosts.length}`);
    }
  } else {
    notFound++;
    console.log(`  ⚠️  URL not found: ${post.url}`);
  }
}

console.log(`\n✓ Updated ${updated} posts`);
if (notFound > 0) {
  console.log(`⚠️  ${notFound} posts not found in current database`);
}

// Verify
const stats = await currentDb.select({
  count: sql<number>`COUNT(*)`,
  min: sql<number>`MIN(${posts.publishedAt})`,
  max: sql<number>`MAX(${posts.publishedAt})`,
}).from(posts);

if (stats[0]) {
  const { count, min, max } = stats[0];
  console.log(`\nVerification:`);
  console.log(`  Total posts: ${count}`);
  console.log(`  Date range: ${new Date(min * 1000).toISOString()} to ${new Date(max * 1000).toISOString()}`);
}

console.log('\n✓ Migration complete!');
