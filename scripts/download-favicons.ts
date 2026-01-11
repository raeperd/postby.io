import fs from 'node:fs';
import path from 'node:path';

const COMPANY_DOMAINS: Record<string, string> = {
  toss: 'toss.tech',
  coupang: 'coupang.com',
  daangn: 'daangn.com',
  kakao: 'tech.kakao.com',
  naver: 'naver.com',
  line: 'techblog.lycorp.co.jp',
  woowahan: 'techblog.woowahan.com',
};

const FAVICON_API = 'https://www.google.com/s2/favicons';
const OUTPUT_DIR = path.join(import.meta.dirname, '../public/favicons');

const force = process.argv.includes('--force');

async function downloadFavicon(company: string, domain: string): Promise<'downloaded' | 'skipped'> {
  const outputPath = path.join(OUTPUT_DIR, `${company}.png`);

  if (!force && fs.existsSync(outputPath)) {
    console.log(`Skipped: ${company}.png (already exists)`);
    return 'skipped';
  }

  const url = `${FAVICON_API}?domain=${domain}&sz=32`;
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Failed to fetch favicon for ${company}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`Downloaded: ${company}.png`);
  return 'downloaded';
}

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Downloading company favicons...${force ? ' (force mode)' : ''}\n`);

  const results = await Promise.allSettled(
    Object.entries(COMPANY_DOMAINS).map(([company, domain]) => downloadFavicon(company, domain))
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error('\nFailed downloads:');
    failed.forEach(r => {
      if (r.status === 'rejected') {
        console.error(`  - ${r.reason}`);
      }
    });
    process.exit(1);
  }

  const downloaded = results.filter(r => r.status === 'fulfilled' && r.value === 'downloaded').length;
  const skipped = results.filter(r => r.status === 'fulfilled' && r.value === 'skipped').length;
  console.log(`\nDone! Downloaded: ${downloaded}, Skipped: ${skipped}`);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
