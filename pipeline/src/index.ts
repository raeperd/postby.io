import { scrapeCompany, scrapeAll, COMPANIES } from './scraper';

async function main(): Promise<void> {
  const command = process.argv[2];
  const company = process.argv[3];

  if (!command) {
    console.error('Usage: tsx src/index.ts <command> [company]');
    console.error('\nCommands:');
    console.error('  scrape <company>    - Scrape articles using Firecrawl API');
    console.error('  scrape-all          - Scrape all companies');
    console.error('\nAvailable companies: ' + COMPANIES.join(', '));
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
    if (!COMPANIES.includes(company as (typeof COMPANIES)[number])) {
      console.error(`Unknown company: ${company}`);
      console.error('Available companies: ' + COMPANIES.join(', '));
      process.exit(1);
    }
    await scrapeCompany(company);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Available commands: scrape, scrape-all');
  process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
