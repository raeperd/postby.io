import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export interface FirecrawlResponse {
  url: string;
  company: string;
  scrapedAt: string;
  markdown: string;
  summary: string;
  links: string[];
  rawHtml: string;
  metadata: {
    title: string;
    language?: string;
    statusCode?: number;
  };
}

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(), // Generated from URL using SHA-1 hash (40 hex chars)
    url: text('url').notNull().unique(),
    company: text('company').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    status: text('status', { enum: ['pending', 'success', 'failed'] })
      .notNull()
      .default('pending'),
    firecrawlData: text('firecrawl_data', { mode: 'json' })
      .$type<FirecrawlResponse>()
      .notNull(),
  },
  table => [
    index('url_idx').on(table.url),
    index('company_idx').on(table.company),
    index('status_idx').on(table.status),
    index('published_at_idx').on(table.publishedAt),
  ]
);

const client = createClient({
  url: 'file:posts.db',
});

export const db = drizzle(client, { schema: { posts } });

export const selectPostSchema = createSelectSchema(posts);

export const insertPostSchema = createInsertSchema(posts, {
  id: z.string().min(1, 'ID is required'),
  url: z.url({ message: 'Must be a valid URL' }),
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).default([]),
  company: z.string().min(1, 'Company is required'),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
