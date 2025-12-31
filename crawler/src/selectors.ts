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
    publishedDate: "#root > div > div.m.c > div.ac > div.cd.bi.ce.cf.cg.ch > div > div.ic.id.ie.if.m > article > div > div > section > div > div:nth-child(2) > div > div > div > div.ac.ka.kb.kc.ke.kf.kh.ki.kj > div.ac.r.kw > span > div > span:nth-child(3)",
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
  if (!selector) {
    return null;
  }

  const $ = cheerio.load(html);
  const element = $(selector.publishedDate);

  if (element.length === 0) {
    return null;
  }

  const text = element.text().trim();

  // Format 1: <span data-testid="storyPublishDate">Oct 15, 2024</span>
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

  // Format 2: <time datetime="2025-12-23">2025-12-23</time>
  const datetime = element.attr('datetime');
  if (datetime) {
    const date = new Date(datetime);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Format 3: <dd>2025.12.18</dd>
  const ddText = text.replace(/<dd>|<\/dd>/g, '').trim();
  const date = new Date(ddText);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Format 4: <span>2025. 12. 26.</span>
  const spanMatch = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (spanMatch) {
    const year = parseInt(spanMatch[1]);
    const month = parseInt(spanMatch[2]) - 1;
    const day = parseInt(spanMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

type SelectorsConfig = Record<string, CompanySelector>;

const SELECTORS_PATH = path.join(process.cwd(), 'data', 'selectors.json');

let selectorsCache: SelectorsConfig | null = null;

export function loadSelectors(): SelectorsConfig {
  if (selectorsCache) {
    return selectorsCache;
  }

  const content = fs.readFileSync(SELECTORS_PATH, 'utf-8');
  selectorsCache = JSON.parse(content);
  return selectorsCache!;
}

export function getCompanySelector(company: string): CompanySelector | null {
  const config = loadSelectors();
  return config[company] || null;
}

export function extractPublishDate(html: string, selector: string): Date | null {
  if (!selector) {
    return null;
  }

  const $ = cheerio.load(html);
  const element = $(selector);

  if (element.length === 0) {
    return null;
  }

  const text = element.text().trim();

  // Format 1: <span data-testid="storyPublishDate">Oct 15, 2024</span>
  const dataTestid = element.attr('data-testid');
  if (dataTestid === 'storyPublishDate') {
    const parts = text.split(', ');
    if (parts.length === 2) {
      const monthStr = parts[0].trim();
      const year = parseInt(parts[1].trim());
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      };
      const month = monthMap[monthStr];
      const date = new Date(year, month, 1);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Format 2: <time datetime="2025-12-23">2025-12-23</time>
  const datetime = element.attr('datetime');
  if (datetime) {
    const date = new Date(datetime);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Format 3: <dd>2025.12.18</dd>
  const ddText = text.replace(/<dd>|<\/dd>/g, '').trim();
  const date = new Date(ddText);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Format 4: <span>2025. 12. 26.</span>
  const spanMatch = text.match(/(\d{4})\s+년?\s*(\d{1,2})\.?\s*월?/);
  if (spanMatch) {
    const year = parseInt(spanMatch[1]);
    const month = parseInt(spanMatch[2]) - 1;
    const day = parseInt(spanMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Format 5: <span data-v-c99b4e88="">2025.12.22</span>
  const dataVMatch = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dataVMatch) {
    const year = parseInt(dataVMatch[1]);
    const month = parseInt(dataVMatch[2]) - 1;
    const day = parseInt(dataVMatch[3]);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function extractPublishDateForCompany(
  html: string,
  company: string
): Date | null {
  const selector = getCompanySelector(company);
  if (!selector) {
    console.warn(`No selectors found for company: ${company}`);
    return null;
  }

  if (!selector.publishedDate) {
    console.warn(
      `Selector for ${company} is empty. Needs to be configured.`
    );
    return null;
  }

  return extractPublishDate(html, selector.publishedDate);
}
