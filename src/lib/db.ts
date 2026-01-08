import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts } from '@crawler/db';
import type { Post, InsertPostInput } from '@crawler/db';
import { createHash } from 'node:crypto';

export { posts };
export type { Post, InsertPostInput };

/**
 * Generate SHA-1 hash ID from URL
 * Removes https:// prefix before hashing
 * Returns 40-character hex string
 */
export function urlToId(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

// Create client pointing to crawler's database
const client = createClient({
  url: 'file:./crawler/posts.db',
});

export const db = drizzle(client, { schema: { posts } });

/**
 * Insert a post with auto-generated ID from URL
 * @param data Post data without ID (ID is generated from URL)
 * @returns Inserted post with generated ID
 */
export async function insertPost(data: InsertPostInput) {
  const id = urlToId(data.url);
  return db.insert(posts).values({ ...data, id }).returning();
}
