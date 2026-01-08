import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts } from '@crawler/db';
import type { Post } from '@crawler/db';
import { createHash } from 'node:crypto';

export { posts };
export type { Post };

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
