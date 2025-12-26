export interface ParsingRule {
  name: string
  listUrl: string
  listSelectors: {
    postLinks: string
    nextPage?: string
  }
  contentSelectors: {
    title: string
    content: string
    tags: string
    publishedAt: string
  }
}

export const rules: Record<string, ParsingRule> = {
  naver: {
    name: 'naver',
    listUrl: 'https://d2.naver.com/home',
    listSelectors: {
      postLinks: '.post-item a',
      nextPage: '.pagination .next'
    },
    contentSelectors: {
      title: 'h1.post-title',
      content: '.post-content',
      tags: '.post-tags a',
      publishedAt: 'time.published'
    }
  }
}
