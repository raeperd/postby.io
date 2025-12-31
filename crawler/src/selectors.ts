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

  // Try parsing as ISO date first
  const isoDate = new Date(text);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try common Korean date formats
  const koreanPatterns = [
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, // 2025년 12월 24일
    /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/, // 2025. 12. 24
    /(\d{4})-(\d{2})-(\d{2})/, // 2025-12-24
  ];

  for (const pattern of koreanPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JS months are 0-indexed
      const day = parseInt(match[3]);
      const date = new Date(year, month, day);

      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try common English date formats (for Medium, etc.)
  const englishPatterns = [
    /([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})/, // Dec 24, 2025 or Dec 24 2025
    /(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/, // 24 Dec 2025
  ];

  const monthNames: Record<string, number> = {
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

  for (const pattern of englishPatterns) {
    const match = text.match(pattern);
    if (match) {
      let year: number, month: number, day: number;

      if (pattern.source.startsWith('([A-Z]')) {
        // Format: Dec 24, 2025
        const monthStr = match[1];
        month = monthNames[monthStr];
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else {
        // Format: 24 Dec 2025
        day = parseInt(match[1]);
        const monthStr = match[2];
        month = monthNames[monthStr];
        year = parseInt(match[3]);
      }

      if (month !== undefined) {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
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
