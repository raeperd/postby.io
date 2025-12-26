import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
  url: schema => schema.url('Must be a valid URL'),
  title: schema => schema.min(1, 'Title is required').max(500, 'Title too long'),
  content: schema => schema.min(1, 'Content is required'),
  tags: schema => schema.default([]),
  company: schema => schema.min(1, 'Company is required'),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
