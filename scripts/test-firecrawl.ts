import Firecrawl from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { urlToId } from '../crawler/src/db.js';

// Load .env from crawler directory
dotenv.config({ path: path.join(process.cwd(), 'crawler', '.env') });

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

async function testScrape(url: string): Promise<void> {
  console.log(`Testing Firecrawl API with URL: ${url}`);
  console.log('Requesting formats: markdown, summary, links, rawHtml');
  console.log('Location: KR, Languages: ko\n');

  try {
    const result = await firecrawl.scrape(url, {
      formats: ['markdown', 'summary', 'links', 'rawHtml'],
      location: {
        country: 'KR',
        languages: ['ko'],
      },
    });

    console.log('✓ Scrape successful!');
    console.log('\nAvailable fields in result:');
    console.log(Object.keys(result).join(', '));

    if (result.metadata) {
      console.log('\nMetadata fields:');
      console.log(Object.keys(result.metadata).join(', '));
    }

    // Save full response to JSON file
    const id = urlToId(url);
    const outputDir = path.join(process.cwd(), 'crawler', 'data', 'firecrawl');
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${id}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`\n✓ Full response saved to: ${outputPath}`);
    console.log(`  ID: ${id}`);
    console.log(`  URL: ${url}`);

    // Print summary of what we got
    console.log('\n--- Response Summary ---');
    console.log(`Markdown length: ${result.markdown?.length ?? 0} chars`);
    console.log(`Raw HTML length: ${result.rawHtml?.length ?? 0} chars`);
    console.log(`Summary length: ${result.summary?.length ?? 0} chars`);
    console.log(`Links count: ${result.links?.length ?? 0}`);
    console.log(`Title: ${result.metadata?.title ?? 'N/A'}`);
    console.log(`Language: ${result.metadata?.language ?? 'N/A'}`);
    console.log(`Status Code: ${result.metadata?.statusCode ?? 'N/A'}`);

    // Check for publish date fields
    console.log('\n--- Checking for Publish Date Fields ---');
    if (result.metadata) {
      const dateFields = Object.keys(result.metadata).filter(key =>
        key.toLowerCase().includes('date') ||
        key.toLowerCase().includes('time') ||
        key.toLowerCase().includes('publish')
      );
      if (dateFields.length > 0) {
        console.log('Found date-related fields:');
        dateFields.forEach(field => {
          console.log(`  ${field}: ${result.metadata![field]}`);
        });
      } else {
        console.log('No date-related fields found in metadata');
      }
    }

    console.log('\n--- First 500 chars of markdown ---');
    console.log(result.markdown?.slice(0, 500) ?? 'N/A');
  } catch (error) {
    console.error('✗ Scrape failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: tsx scripts/test-firecrawl.ts <url>');
    console.error('\nExample:');
    console.error('  tsx scripts/test-firecrawl.ts https://toss.tech/article/vulnerability-analysis-automation-1');
    process.exit(1);
  }

  await testScrape(url);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
