import * as cheerio from 'cheerio';

export interface CompanySelector {
  publishedDate: string;
  publishedDateFormat: string;
  testUrl: string;
}

const SELECTORS: Record<string, CompanySelector> = {
  toss: {
    publishedDate: "#__next > div > div.p-container.p-container--default.css-2ndca > div > div.css-1dxrfx2.e1nrxxaj0 > article > header > section > div > div.css-154r2lc.esnk6d50",
    publishedDateFormat: "YYYY년 MM월 DD일",
    testUrl: "https://toss.tech/article/vulnerability-analysis-automation-1",
  },
  coupang: {
    publishedDate: "#root > div > div.m.c > div.ac > div.cd.bi.ce.cf.cg.ch > div > div.ic.id.ie.if.m > article > div > section > div > div:nth-child(2) > div > div > div > div.ac.r.kw > span > div > span:nth-child(3)",
    publishedDateFormat: "<span>MMM DD, YYYY</span>",
    testUrl: "https://medium.com/coupang-engineering",
  },
  daangn: {
    publishedDate: "#root > div > div.m.c > div.ac > div.cd.bi.ce.cf.cg.ch > div > div.ic.id.ie.if.m > article > div > div > section > div > div:nth-child(2) > div > div > div > div.ac.ka.kb.kc.ke.kf.kg.kh.ki.kj > div.ac.r.kx > span > div > span:nth-child(3)",
    publishedDateFormat: "<span>MMM DD, YYYY</span>",
    testUrl: "https://medium.com/daangn",
  },
  akao: {
    publishedDate: "#__nuxt > div.container-doc > main > article > div.wrap_tit > div > span:nth-child(2)",
    publishedDateFormat: "<span>YYYY.MM.DD</span>",
    testUrl: "https://tech.kakao.com",
  },
  naver: {
    publishedDate: "#container > article > div > header > div.detail > time",
    publishedDateFormat: "<time datetime='YYYY-MM-DD'>YYYY-MM-DD</time>",
    testUrl: "https://d2.naver.com",
  },
  line: {
    publishedDate: "#container > article > div > header > div.detail > dl > dd:nth-child(2)",
    publishedDateFormat: "<dd>...</dd>",
    testUrl: "https://engineering.linecorp.com",
  },
  woowahan: {
    publishedDate: "body > div.content.vuejs > div.content-wrap.content-single > div.post-content > div.post-header > div > div.post-header-author > span:nth-child(1)",
    publishedDateFormat: "<span>YYYY. MM. DD.</span>",
    testUrl: "https://techblog.woowahan.com",
  },
};

export function getCompanySelector(company: string): CompanySelector | null {
  return SELECTORS[company] || null;
}

export function extractPublishDate(html: string, company: string): Date | null {
  const selector = getCompanySelector(company);
  if (!selector || !selector.publishedDate) {
    return null;
  }

  const $ = cheerio.load(html);
  const element = $(selector.publishedDate);

  if (element.length === 0) {
    return null;
  }

  const text = element.text().trim();

  if (selector.publishedDateFormat.includes('data-testid')) {
    const dataTestid = element.attr('data-testid');
    if (dataTestid === 'storyPublishDate') {
      const parts = text.split(', ');
      if (parts.length === 2) {
        const monthStr = parts[0].trim();
        const year = parseInt(parts[1].trim());
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
        const date = new Date(year, month, 1);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  if (selector.publishedDateFormat.includes('datetime')) {
    const datetime = element.attr('datetime');
    if (datetime) {
      const date = new Date(datetime);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  if (selector.publishedDateFormat.includes('span')) {
    const spanText = element.html() || element.text() || '';
    const spanMatch = spanText.match(/(\d{4})\.(\d{2})\.\s*(\d{2})/);
    if (spanMatch) {
      const year = parseInt(spanMatch[1]);
      const month = parseInt(spanMatch[2]) - 1;
      const day = parseInt(spanMatch[3]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}
