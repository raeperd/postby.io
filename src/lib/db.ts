import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { posts, urlToId } from '@pipeline/db';
import type { Post } from '@pipeline/db';

export { posts, urlToId };
export type { Post };

// Create client pointing to pipeline's database
const client = createClient({
  url: 'file:./pipeline/posts.db',
});

export const db = drizzle(client, { schema: { posts } });
