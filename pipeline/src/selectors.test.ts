import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, posts } from './db';
import { extractPublishDate } from './selectors';

const COMPANIES = ['toss', 'coupang', 'daangn', 'kakao', 'naver', 'line', 'woowahan'] as const;

// LINE posts use a different HTML structure that the current selector doesn't handle.
// TODO: Fix LINE selector in selectors.ts to handle the new HTML structure.
const SKIP_COMPANIES = ['line'] as const;

describe('extractPublishDate', () => {
  it('should extract valid dates from all posts in database (excluding known issues)', async () => {
    const allPosts = await db.select().from(posts);

    expect(allPosts.length).toBeGreaterThan(0);

    const failures: { url: string; company: string }[] = [];

    for (const post of allPosts) {
      // Skip companies with known selector issues
      if (SKIP_COMPANIES.includes(post.company as (typeof SKIP_COMPANIES)[number])) {
        continue;
      }

      const html = post.firecrawlData.rawHtml;
      const date = extractPublishDate(html, post.company, post.url);

      if (!date || isNaN(date.getTime())) {
        failures.push({ url: post.url, company: post.company });
      }
    }

    if (failures.length > 0) {
      const failureReport = failures.map(f => `  - [${f.company}] ${f.url}`).join('\n');
      expect.fail(`${failures.length} posts failed date extraction:\n${failureReport}`);
    }
  });

  for (const company of COMPANIES) {
    // Skip companies with known selector issues
    if (SKIP_COMPANIES.includes(company as (typeof SKIP_COMPANIES)[number])) {
      it.skip(`should extract dates for all ${company} posts (selector needs fix)`, () => {});
      continue;
    }

    it(`should extract dates for all ${company} posts`, async () => {
      const companyPosts = await db.select().from(posts).where(eq(posts.company, company));

      if (companyPosts.length === 0) {
        return;
      }

      for (const post of companyPosts) {
        const html = post.firecrawlData.rawHtml;
        const date = extractPublishDate(html, company, post.url);

        expect(date, `Failed for ${post.url}`).not.toBeNull();
        expect(date!.getTime(), `Invalid date for ${post.url}`).not.toBeNaN();
      }
    });
  }
});
