import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

interface CompanySelector {
  publishedDate: string;
  publishedDateFormat: string;
  testUrl: string;
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
