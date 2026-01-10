import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts, urlToId } from '@crawler/db';
import type { Post } from '@crawler/db';

export { posts, urlToId };
export type { Post };

// Create client pointing to crawler's database
const client = createClient({
  url: 'file:./crawler/posts.db',
});

export const db = drizzle(client, { schema: { posts } });
