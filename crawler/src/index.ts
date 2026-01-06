import { fetchPage } from './fetcher';
import { parsePostList } from './parser';
import { rules, type ParsingRule } from './rules';
import { scrapeCompany, scrapeAll } from './scraper';

async function crawlPostList(rule: ParsingRule): Promise<string[]> {
  const discoveredUrls: string[] = [];
  let currentUrl: string | undefined = rule.listUrl;
  let pageNum = 1;
  const MAX_PAGES = 100;

  while (currentUrl && pageNum <= MAX_PAGES) {
    console.log(`Fetching list page ${pageNum}: ${currentUrl}`);

    const result = await fetchPage(currentUrl);
    const listResult = parsePostList(result.html, rule);

    discoveredUrls.push(...listResult.postUrls);
    console.log(`  Found ${listResult.postUrls.length} posts on page ${pageNum}`);

    if (!listResult.hasNextPage || !listResult.nextPageUrl) {
      console.log(`  No more pages`);
      break;
    }

    currentUrl = listResult.nextPageUrl;
    pageNum++;

    console.log(`  Waiting 3 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (pageNum > MAX_PAGES) {
    console.log(`  Reached max page limit (${MAX_PAGES})`);
  }

  return discoveredUrls;
}

async function crawl(company: string): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Starting crawl for: ${company}`);
  console.log(`${'='.repeat(50)}\n`);

  const rule = rules[company];

  console.log('Phase 1: Discovering post URLs...');
  const discoveredUrls = await crawlPostList(rule);
  console.log(`\nDiscovered ${discoveredUrls.length} total post URLs`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Crawl complete for: ${company}`);
  console.log(`${'='.repeat(50)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const company = process.argv[3];

  if (!command) {
    console.error('Usage: tsx src/index.ts <command> [company]');
    console.error('\nCommands:');
    console.error('  discover <company>  - Discover post URLs from RSS/list pages');
    console.error('  scrape <company>    - Scrape articles using Firecrawl API');
    console.error('  scrape-all          - Scrape all companies');
    console.error('\nAvailable companies: toss, coupang, daangn, kakao, naver, line, woowahan');
    process.exit(1);
  }

  if (command === 'scrape-all') {
    await scrapeAll();
    return;
  }

  if (command === 'scrape') {
    if (!company) {
      console.error('Error: Company name required for scrape command');
      console.error('Usage: tsx src/index.ts scrape <company>');
      process.exit(1);
    }
    await scrapeCompany(company);
    return;
  }

  if (command === 'discover') {
    if (!company) {
      console.error('Error: Company name required for discover command');
      console.error('Usage: tsx src/index.ts discover <company>');
      process.exit(1);
    }
    if (!rules[company]) {
      console.error(`Unknown company: ${company}`);
      console.error('Available companies: ' + Object.keys(rules).join(', '));
      process.exit(1);
    }
    await crawl(company);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Available commands: discover, scrape, scrape-all');
  process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
