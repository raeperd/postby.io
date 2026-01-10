import Firecrawl from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { urlToId } from '../pipeline/src/db.js';
import { withTimeout } from '../pipeline/src/scraper.js';

dotenv.config({ path: path.join(process.cwd(), 'pipeline', '.env') });

if (!process.env.FIRECRAWL_API_KEY) {
  throw new Error('FIRECRAWL_API_KEY not found in environment. Check pipeline/.env file.');
}

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

function getCompanyFromUrl(url: string): string {
  if (url.includes('toss.tech')) return 'toss';
  if (url.includes('medium.com/coupang')) return 'coupang';
  if (url.includes('medium.com/daangn')) return 'daangn';
  if (url.includes('tech.kakao.com')) return 'kakao';
  if (url.includes('d2.naver.com')) return 'naver';
  if (url.includes('techblog.lycorp.co.jp')) return 'line';
  if (url.includes('techblog.woowahan.com')) return 'woowahan';
  throw new Error(`Unknown company for URL: ${url}`);
}

async function retryUrl(url: string, forceOverwrite: boolean = false): Promise<void> {
  const company = getCompanyFromUrl(url);
  const id = urlToId(url);
  const outputDir = path.join(process.cwd(), 'pipeline', 'data', 'firecrawl', company);
  const outputPath = path.join(outputDir, `${id}.json`);

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Retrying: ${url}`);
  console.log(`Company: ${company}`);
  console.log(`Output: ${id}.json`);
  console.log(`${'='.repeat(60)}\n`);

  if (fs.existsSync(outputPath) && !forceOverwrite) {
    console.log('⊘ File already exists. Use --force to overwrite.');
    return;
  }

  try {
    console.log('⏳ Scraping (timeout: 180s)...');
    const result = await withTimeout(
      firecrawl.scrape(url, {
        formats: ['markdown', 'summary', 'links', 'rawHtml'],
        location: {
          country: 'KR',
          languages: ['ko'],
        },
      }),
      180000,
      `Timeout after 180s for ${url}`
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          url,
          company,
          scrapedAt: new Date().toISOString(),
          ...result,
        },
        null,
        2
      ),
      'utf-8'
    );

    console.log(`✓ SUCCESS - Saved to ${outputPath}`);
    console.log(`  Markdown: ${result.markdown?.length ?? 0} chars`);
    console.log(`  HTML: ${result.rawHtml?.length ?? 0} chars`);
  } catch (error) {
    console.log(`✗ FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const forceOverwrite = args.includes('--force');
  const urls = args.filter(arg => !arg.startsWith('--'));

  if (urls.length === 0) {
    console.error('Usage: tsx scripts/retry-scrape.ts <url1> [url2] [...] [--force]');
    console.error('\nExample:');
    console.error('  tsx scripts/retry-scrape.ts https://d2.naver.com/helloworld/4571155');
    console.error('  tsx scripts/retry-scrape.ts https://d2.naver.com/helloworld/4571155 --force');
    console.error('\nFailed URLs from previous scrape:');
    console.error('  https://d2.naver.com/helloworld/4571155');
    console.error('  https://d2.naver.com/helloworld/1104856');
    console.error('  https://techblog.woowahan.com/24251/');
    console.error('  https://techblog.lycorp.co.jp/ko/give-me-the-code-and-then-ai-and-i-will-provide-the-api-reference-for-you');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Retrying ${urls.length} URL(s)`);
  console.log(`Force overwrite: ${forceOverwrite}`);
  console.log(`${'='.repeat(60)}`);

  let succeeded = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      await retryUrl(url, forceOverwrite);
      succeeded++;
    } catch {
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results:`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${urls.length}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
