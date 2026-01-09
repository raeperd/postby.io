#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { extractPublishDate } from '../crawler/src/selectors';

interface FirecrawlResponse {
  url: string;
  company: string;
  rawHtml: string;
  metadata: {
    title: string;
  };
}

const COMPANIES = ['toss', 'coupang', 'daangn', 'kakao', 'naver', 'line', 'woowahan'];

function testCompany(company: string): void {
  const dataDir = path.join(process.cwd(), 'crawler/data/firecrawl', company);

  if (!fs.existsSync(dataDir)) {
    console.log(`  ⊘ No data directory for ${company}`);
    return;
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).slice(0, 5);

  if (files.length === 0) {
    console.log(`  ⊘ No JSON files found for ${company}`);
    return;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${company.toUpperCase()} (${files.length} samples)`);
  console.log('='.repeat(80));

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data: FirecrawlResponse = JSON.parse(content);

    const date = extractPublishDate(data.rawHtml, company, data.url);

    if (date) {
      successCount++;
      console.log(`  ✓ ${file}`);
      console.log(`    URL: ${data.url}`);
      console.log(`    Title: ${data.metadata.title?.slice(0, 60)}...`);
      console.log(`    Date: ${date.toISOString().split('T')[0]} (${date.toLocaleDateString('ko-KR')})`);
    } else {
      failCount++;
      console.log(`  ✗ ${file}`);
      console.log(`    URL: ${data.url}`);
      console.log(`    Title: ${data.metadata.title?.slice(0, 60)}...`);
      console.log(`    Date: NOT EXTRACTED`);
    }
  }

  console.log(`\n  Summary: ${successCount}/${files.length} successful, ${failCount} failed`);
}

function main(): void {
  const args = process.argv.slice(2);

  console.log('\n' + '='.repeat(80));
  console.log('Testing Date Extraction with Updated Selectors');
  console.log('='.repeat(80));

  if (args.length > 0) {
    // Test specific company
    const company = args[0].toLowerCase();
    if (!COMPANIES.includes(company)) {
      console.error(`\nError: Unknown company "${company}"`);
      console.error(`Available companies: ${COMPANIES.join(', ')}`);
      process.exit(1);
    }
    testCompany(company);
  } else {
    // Test all companies
    for (const company of COMPANIES) {
      testCompany(company);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test Complete');
  console.log('='.repeat(80) + '\n');
}

main();
