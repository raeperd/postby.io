import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts } from '@crawler/db';
import type { Post } from '@crawler/db';

export { posts };
export type { Post };

// Create client pointing to crawler's database
const client = createClient({
  url: 'file:./crawler/posts.db',
});

export const db = drizzle(client, { schema: { posts } });
