import type { ParsingRule } from './rules';

export function parsePostList(
  html: string,
  rule: ParsingRule
): { postUrls: string[]; hasNextPage: boolean; nextPageUrl?: string } {
  // TODO: Implement list page parsing
  console.log(`[PARSER] parsePostList called for rule: ${rule.name}`);

  return {
    postUrls: [],
    hasNextPage: false,
  };
}

export function parsePostContent(
  html: string,
  rule: ParsingRule
): { title: string; content: string; tags: string[]; publishedAt: Date } {
  // TODO: Implement content parsing
  console.log(`[PARSER] parsePostContent called for rule: ${rule.name}`);

  return {
    title: 'Mock Title',
    content: 'Mock content',
    tags: [],
    publishedAt: new Date(),
  };
}
