#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

interface FirecrawlResponse {
  markdown?: string;
  metadata?: Record<string, unknown>;
  html?: string;
  rawHtml?: string;
  links?: string[];
  summary?: string;
}

function extractPublishDateFromHtml(html: string): Date | null {
  // Strategy 1: Look for __NEXT_DATA__ script tag (Next.js)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (nextDataMatch) {
    try {
      const jsonData = JSON.parse(nextDataMatch[1]);
      
      // Common paths for publish date in Next.js data
      const possiblePaths = [
        'props.pageProps.prefetchResult.dehydratedState.queries[].state.data',
        'props.pageProps.post',
        'props.pageProps.article',
      ];
      
      // Search for publishedTime, publishedAt, published_time, etc.
      const jsonStr = JSON.stringify(jsonData);
      const datePatterns = [
        /\"publishedTime\":\"([^\"]+)\"/,
        /\"publishedAt\":\"([^\"]+)\"/,
        /\"published_time\":\"([^\"]+)\"/,
        /\"date_published\":\"([^\"]+)\"/,
        /\"createdTime\":\"([^\"]+)\"/,
      ];
      
      for (const pattern of datePatterns) {
        const match = jsonStr.match(pattern);
        if (match) {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime())) {
            console.log(`  ✓ Found date in __NEXT_DATA__ (${pattern}): ${match[1]}`);
            return date;
          }
        }
      }
    } catch (e) {
      console.log(`  ✗ Failed to parse __NEXT_DATA__:`, e);
    }
  }
  
  // Strategy 2: Look for JSON-LD structured data
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
  for (const match of jsonLdMatches) {
    try {
      const jsonLd = JSON.parse(match[1]);
      if (jsonLd.datePublished) {
        const date = new Date(jsonLd.datePublished);
        if (!isNaN(date.getTime())) {
          console.log(`  ✓ Found date in JSON-LD: ${jsonLd.datePublished}`);
          return date;
        }
      }
    } catch (e) {
      // Continue to next match
    }
  }
  
  // Strategy 3: Look for time elements
  const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/);
  if (timeMatch) {
    const date = new Date(timeMatch[1]);
    if (!isNaN(date.getTime())) {
      console.log(`  ✓ Found date in <time> element: ${timeMatch[1]}`);
      return date;
    }
  }
  
  // Strategy 4: Look for meta tags
  const metaPatterns = [
    /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/,
    /<meta[^>]*name="publish[^"]*"[^>]*content="([^"]+)"/,
    /<meta[^>]*name="date"[^>]*content="([^"]+)"/,
  ];
  
  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime())) {
        console.log(`  ✓ Found date in meta tag (${pattern}): ${match[1]}`);
        return date;
      }
    }
  }
  
  console.log(`  ✗ No publish date found in HTML`);
  return null;
}

function analyzeFirecrawlResponse(jsonPath: string): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing: ${path.basename(jsonPath)}`);
  console.log('='.repeat(80));
  
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data: FirecrawlResponse = JSON.parse(jsonContent);
  
  // Check metadata
  console.log('\n1. Checking Firecrawl metadata fields...');
  if (data.metadata) {
    const dateFields = Object.keys(data.metadata).filter(key =>
      key.toLowerCase().includes('date') ||
      key.toLowerCase().includes('time') ||
      key.toLowerCase().includes('publish')
    );
    
    if (dateFields.length > 0) {
      console.log('  Found date-related metadata fields:');
      dateFields.forEach(field => {
        console.log(`    ${field}: ${data.metadata![field]}`);
      });
    } else {
      console.log('  ✗ No date-related fields in metadata');
    }
  }
  
  // Check HTML content (prefer rawHtml over html)
  const htmlToCheck = data.rawHtml || data.html;
  console.log('\n2. Checking HTML content for publish date...');
  console.log(`   Using: ${data.rawHtml ? 'rawHtml' : 'html'} (${htmlToCheck?.length ?? 0} chars)`);
  
  if (htmlToCheck) {
    const publishDate = extractPublishDateFromHtml(htmlToCheck);
    
    if (publishDate) {
      console.log(`\n  📅 FINAL RESULT: ${publishDate.toISOString()}`);
      console.log(`     Formatted: ${publishDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
    } else {
      console.log(`\n  ⚠️  Could not extract publish date from HTML`);
    }
  } else {
    console.log('  ✗ No HTML field in response');
  }
  
  // Print URL for reference
  if (data.metadata?.sourceURL) {
    console.log(`\n  🔗 URL: ${data.metadata.sourceURL}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/analyze-firecrawl-pubdate.ts <json-file>');
    console.error('\nExample:');
    console.error('  tsx scripts/analyze-firecrawl-pubdate.ts crawler/data/firecrawl/47bf9aa9c5c21614.json');
    process.exit(1);
  }
  
  const inputPath = args[0];
  const stats = fs.statSync(inputPath);
  
  if (stats.isDirectory()) {
    const files = fs.readdirSync(inputPath)
      .filter(f => f.endsWith('.json') && !f.includes('README'))
      .map(f => path.join(inputPath, f));
    
    files.forEach(file => analyzeFirecrawlResponse(file));
  } else {
    analyzeFirecrawlResponse(inputPath);
  }
}

main();
