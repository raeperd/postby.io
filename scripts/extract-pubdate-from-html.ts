#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

interface FirecrawlResponse {
  markdown?: string;
  metadata?: Record<string, unknown>;
  html?: string;
  rawHtml?: string;
  links?: string[];
  summary?: string;
}

function extractPublishDateWithSelector(html: string, selector: string): Date | null {
  const $ = cheerio.load(html);
  const element = $(selector);
  
  if (element.length === 0) {
    console.log(`  ✗ Selector not found: ${selector}`);
    return null;
  }
  
  console.log(`  ✓ Found element with selector`);
  console.log(`    Text content: "${element.text().trim()}"`);
  
  // Try to parse as date
  const text = element.text().trim();
  const date = new Date(text);
  
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try common Korean date formats
  const koreanDatePatterns = [
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,  // 2025년 12월 24일
    /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/,    // 2025. 12. 24
    /(\d{4})-(\d{2})-(\d{2})/,                 // 2025-12-24
  ];
  
  for (const pattern of koreanDatePatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JS months are 0-indexed
      const day = parseInt(match[3]);
      const parsedDate = new Date(year, month, day);
      
      if (!isNaN(parsedDate.getTime())) {
        console.log(`    Parsed using pattern: ${pattern}`);
        return parsedDate;
      }
    }
  }
  
  console.log(`  ✗ Could not parse date from text: "${text}"`);
  return null;
}

function analyzeHtmlStructure(html: string): void {
  const $ = cheerio.load(html);
  
  console.log('\n--- Searching for date-related elements ---');
  
  // Strategy 1: Look for <time> elements
  const timeElements = $('time');
  if (timeElements.length > 0) {
    console.log(`\n  Found ${timeElements.length} <time> element(s):`);
    timeElements.each((i, el) => {
      const $el = $(el);
      console.log(`    ${i + 1}. datetime="${$el.attr('datetime')}" text="${$el.text().trim()}"`);
    });
  }
  
  // Strategy 2: Look for elements with date-related classes
  const dateClasses = ['date', 'published', 'time', 'timestamp', 'pubdate'];
  dateClasses.forEach(cls => {
    const elements = $(`[class*="${cls}"]`);
    if (elements.length > 0) {
      console.log(`\n  Found ${elements.length} element(s) with class containing "${cls}":`);
      elements.slice(0, 3).each((i, el) => {
        const $el = $(el);
        console.log(`    ${i + 1}. class="${$el.attr('class')}" text="${$el.text().trim().slice(0, 50)}"`);
      });
    }
  });
  
  // Strategy 3: Try the specific selector provided
  const specificSelector = '#__next > div > div.p-container.p-container--default.css-2ndca > div > div.css-1dxrfx2.e1nrxxaj0 > article > header > section > div > div.css-154r2lc.esnk6d50';
  const specificElement = $(specificSelector);
  
  console.log(`\n--- Testing specific selector ---`);
  console.log(`  Selector: ${specificSelector}`);
  console.log(`  Found: ${specificElement.length > 0 ? 'YES' : 'NO'}`);
  
  if (specificElement.length > 0) {
    console.log(`  Text: "${specificElement.text().trim()}"`);
    console.log(`  HTML: ${specificElement.html()?.slice(0, 200)}`);
  }
  
  // Strategy 4: Search in article > header area
  const articleHeader = $('article > header, article header, .article-header');
  if (articleHeader.length > 0) {
    console.log(`\n--- Article header area ---`);
    articleHeader.each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim().slice(0, 200);
      console.log(`  ${i + 1}. Text: "${text}"`);
    });
  }
}

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/extract-pubdate-from-html.ts <json-file> [css-selector]');
    console.error('\nExample:');
    console.error('  tsx scripts/extract-pubdate-from-html.ts crawler/data/firecrawl/47bf9aa9c5c21614.json');
    console.error('  tsx scripts/extract-pubdate-from-html.ts crawler/data/firecrawl/47bf9aa9c5c21614.json "time[datetime]"');
    process.exit(1);
  }
  
  const jsonPath = args[0];
  const customSelector = args[1];
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing: ${path.basename(jsonPath)}`);
  console.log('='.repeat(80));
  
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data: FirecrawlResponse = JSON.parse(jsonContent);
  
  const htmlToCheck = data.rawHtml || data.html;
  
  if (!htmlToCheck) {
    console.error('No HTML or rawHtml field in response');
    process.exit(1);
  }
  
  console.log(`\nHTML size: ${htmlToCheck.length} chars`);
  console.log(`Using: ${data.rawHtml ? 'rawHtml' : 'html'}`);
  
  // First, analyze the structure
  analyzeHtmlStructure(htmlToCheck);
  
  // If custom selector provided, try it
  if (customSelector) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Trying custom selector: ${customSelector}`);
    console.log('='.repeat(80));
    const date = extractPublishDateWithSelector(htmlToCheck, customSelector);
    if (date) {
      console.log(`\n  📅 SUCCESS: ${date.toISOString()}`);
      console.log(`     Formatted: ${date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
    }
  }
}

main();
