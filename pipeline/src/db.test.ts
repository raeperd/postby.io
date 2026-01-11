import { describe, it, expect } from 'vitest';
import { db, posts } from './db';

describe('posts validation', () => {
  it('should have posts in database', async () => {
    const allPosts = await db.select().from(posts);
    expect(allPosts.length).toBeGreaterThan(0);
  });

  it('should have non-empty title for all posts', async () => {
    const allPosts = await db.select().from(posts);

    const failures: string[] = [];
    for (const post of allPosts) {
      if (!post.title || post.title.trim().length === 0) {
        failures.push(post.url);
      }
    }

    if (failures.length > 0) {
      expect.fail(
        `${failures.length} posts have empty title:\n${failures.map((u) => `  - ${u}`).join('\n')}`
      );
    }
  });

  it('should have non-empty content for all posts', async () => {
    const allPosts = await db.select().from(posts);

    const failures: string[] = [];
    for (const post of allPosts) {
      if (!post.content || post.content.trim().length === 0) {
        failures.push(post.url);
      }
    }

    if (failures.length > 0) {
      expect.fail(
        `${failures.length} posts have empty content:\n${failures.map((u) => `  - ${u}`).join('\n')}`
      );
    }
  });

  it('should have valid firecrawlData for all posts', async () => {
    const allPosts = await db.select().from(posts);

    const failures: { url: string; reason: string }[] = [];
    for (const post of allPosts) {
      const data = post.firecrawlData;

      if (!data) {
        failures.push({ url: post.url, reason: 'missing firecrawlData' });
        continue;
      }
      if (!data.rawHtml || data.rawHtml.length === 0) {
        failures.push({ url: post.url, reason: 'missing rawHtml' });
      }
      if (!data.url) {
        failures.push({ url: post.url, reason: 'missing url in firecrawlData' });
      }
      if (!data.metadata) {
        failures.push({ url: post.url, reason: 'missing metadata' });
      }
    }

    if (failures.length > 0) {
      expect.fail(
        `${failures.length} posts have invalid firecrawlData:\n${failures.map((f) => `  - ${f.url}: ${f.reason}`).join('\n')}`
      );
    }
  });
});
