import * as cheerio from 'cheerio';

export interface CompanySelector {
  publishedDate: string;
  publishedDateFormat: string;
  testUrl: string;
}

const SELECTORS: Record<string, CompanySelector> = {
  toss: {
    publishedDate:
      '#__next > div > div.p-container.p-container--default.css-2ndca > div > div.css-1dxrfx2.e1nrxxaj0 > article > header > section > div > div.css-154r2lc.esnk6d50',
    publishedDateFormat: 'YYYY년 MM월 DD일',
    testUrl: 'https://toss.tech/article/vulnerability-analysis-automation-1',
  },
  coupang: {
    publishedDate: '[data-testid="storyPublishDate"]',
    publishedDateFormat: 'data-testid="storyPublishDate" MMM DD, YYYY',
    testUrl: 'https://medium.com/coupang-engineering/클라우드-서비스-사용량-관리를-통한-운영-비용-최적화-1521565c64ec',
  },
  daangn: {
    publishedDate: '[data-testid="storyPublishDate"]',
    publishedDateFormat: 'data-testid="storyPublishDate" MMM DD, YYYY',
    testUrl: 'https://medium.com/daangn/당근의-genai-플랫폼-ee2ac8953046',
  },
  kakao: {
    publishedDate: '#__nuxt > div.container-doc > main > article > div.wrap_tit > div > span:nth-child(3)',
    publishedDateFormat: '<span>YYYY.MM.DD</span>',
    testUrl: 'https://tech.kakao.com/posts/795',
  },
  naver: {
    publishedDate: '#container > div > div > div.post_article > div > dl > dd:nth-child(2)',
    publishedDateFormat: '<dd>YYYY.MM.DD</dd>',
    testUrl: 'https://d2.naver.com/helloworld/0931890',
  },
  line: {
    publishedDate: '#container > article > div > header > div.detail > dl > dd:nth-child(2)',
    publishedDateFormat: '<dd>...</dd>',
    testUrl: 'https://techblog.lycorp.co.jp/ko/rag-based-bot-for-streamlining-inquiry-responses',
  },
  woowahan: {
    publishedDate:
      'body > div.content.vuejs > div.content-wrap.content-single > div.post-content > div.post-header > div > div.post-header-author > span:nth-child(1)',
    publishedDateFormat: '<span>YYYY. MM. DD.</span>',
    testUrl: 'https://techblog.woowahan.com/24820/',
  },
};

export function getCompanySelector(company: string): CompanySelector | null {
  return SELECTORS[company] || null;
}

export function extractPublishDate(html: string, company: string, url?: string): Date | null {
  // Hardcoded dates for specific URLs with known issues
  if (url === 'https://toss.tech/article/business-customer-data') {
    // This article has no date in HTML due to Toss bug
    return new Date(2025, 11, 9); // December 9, 2025
  }

  const selector = getCompanySelector(company);
  if (!selector || !selector.publishedDate) {
    return null;
  }

  const $ = cheerio.load(html);
  let element = $(selector.publishedDate);

  // Special case for kakao: try multiple selectors
  if (company === 'kakao' && element.length === 0) {
    // Try alternate nth-child
    const baseSelector = '#__nuxt > div.container-doc > main > article > div.wrap_tit > div';
    const altSelector = selector.publishedDate.includes('nth-child(3)')
      ? baseSelector + ' > span:nth-child(2)'
      : baseSelector + ' > span:nth-child(3)';
    element = $(altSelector);

    // If still not found, try data-v attribute pattern (for older posts without wrap_tit)
    if (element.length === 0) {
      element = $('span[data-v-c99b4e88]')
        .filter(function () {
          return /^\d{4}\.\d{2}\.\d{2}$/.test($(this).text().trim());
        })
        .first();
    }
  }

  if (element.length === 0) {
    return null;
  }

  const text = element.text().trim();

  // Try datetime attribute first (most reliable)
  if (selector.publishedDateFormat.includes('datetime')) {
    const datetime = element.attr('datetime');
    if (datetime) {
      const date = new Date(datetime);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try time element with datetime attribute
  if (selector.publishedDateFormat.includes('time')) {
    const innerHtml = element.html();
    const timeMatch = innerHtml?.match(/<time[^>]*datetime="([^"]+)"/);
    if (timeMatch) {
      const date = new Date(timeMatch[1]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try data-testid based parsing
  if (selector.publishedDateFormat.includes('data-testid')) {
    const dataTestid = element.attr('data-testid');
    if (dataTestid === 'storyPublishDate') {
      // Format: "Mar 27, 2023" or "Dec 19, 2025"
      const parts = text.split(', ');
      if (parts.length === 2) {
        const datePart = parts[0].trim().split(' '); // ["Mar", "27"]
        const year = parseInt(parts[1].trim()); // 2023

        if (datePart.length === 2) {
          const monthStr = datePart[0]; // "Mar"
          const day = parseInt(datePart[1]); // 27

          const monthMap: Record<string, number> = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11,
          };

          const month = monthMap[monthStr];
          if (month !== undefined && !isNaN(day) && !isNaN(year)) {
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }
    }
  }

  // Try common text patterns (fallback for all companies)
  // Korean format: YYYY년 MM월 DD일
  const koreanMatch = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (koreanMatch) {
    const year = parseInt(koreanMatch[1]);
    const month = parseInt(koreanMatch[2]) - 1;
    const day = parseInt(koreanMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Format with dots: YYYY.MM.DD or YYYY. MM. DD.
  const dotMatch = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (dotMatch) {
    const year = parseInt(dotMatch[1]);
    const month = parseInt(dotMatch[2]) - 1;
    const day = parseInt(dotMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // ISO format: YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1;
    const day = parseInt(isoMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}
