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

async function downloadFavicon(company: string, domain: string): Promise<void> {
  const url = `${FAVICON_API}?domain=${domain}&sz=32`;
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Failed to fetch favicon for ${company}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(OUTPUT_DIR, `${company}.png`);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Downloaded: ${company}.png`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('Downloading company favicons...\n');

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

  console.log('\nAll favicons downloaded successfully!');
}

main();
