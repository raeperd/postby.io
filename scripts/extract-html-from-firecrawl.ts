#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

interface FirecrawlResponse {
  markdown?: string;
  metadata?: Record<string, unknown>;
  html?: string;
  links?: string[];
  summary?: string;
}

function extractHtmlFromJson(jsonPath: string): void {
  console.log(`Reading JSON file: ${jsonPath}`);

  // Read JSON file
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data: FirecrawlResponse = JSON.parse(jsonContent);

  if (!data.html) {
    console.error('Error: No HTML field found in JSON response');
    process.exit(1);
  }

  // The HTML is already unescaped by JSON.parse()
  // No need to manually handle \" escapes
  const html = data.html;

  // Create output directory
  const jsonDir = path.dirname(jsonPath);
  const jsonBasename = path.basename(jsonPath, '.json');
  const htmlOutputPath = path.join(jsonDir, `${jsonBasename}.html`);

  // Add proper HTML document structure and formatting
  const formattedHtml = formatHtml(html);

  // Write HTML file
  fs.writeFileSync(htmlOutputPath, formattedHtml, 'utf-8');

  console.log(`✓ HTML extracted and saved to: ${htmlOutputPath}`);
  console.log(`  Original HTML length: ${html.length} chars`);
  console.log(`  Formatted HTML length: ${formattedHtml.length} chars`);

  // Print metadata for reference
  if (data.metadata) {
    console.log('\n--- Metadata ---');
    console.log(`Title: ${data.metadata.title || 'N/A'}`);
    console.log(`URL: ${data.metadata.sourceURL || 'N/A'}`);
    console.log(`Language: ${data.metadata.language || 'N/A'}`);
  }

  console.log('\n✓ You can now open the HTML file in a browser to inspect and find CSS selectors for pubDate');
  console.log(`  open ${htmlOutputPath}`);
}

function formatHtml(html: string): string {
  // Add proper DOCTYPE and head if missing
  if (!html.startsWith('<!DOCTYPE html>')) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extracted HTML</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
    }
    .inspect-hint {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff6b35;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div class="inspect-hint">
    💡 Use browser DevTools (F12) to inspect and find date selectors
  </div>
  ${html}
</body>
</html>`;
  }

  return html;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tsx scripts/extract-html-from-firecrawl.ts <json-file>');
    console.error('\nExample:');
    console.error('  tsx scripts/extract-html-from-firecrawl.ts crawler/data/firecrawl/47bf9aa9c5c21614.json');
    console.error('\nOr extract all JSON files in a directory:');
    console.error('  tsx scripts/extract-html-from-firecrawl.ts crawler/data/firecrawl/');
    process.exit(1);
  }

  const inputPath = args[0];

  // Check if input is a directory or file
  const stats = fs.statSync(inputPath);

  if (stats.isDirectory()) {
    console.log(`Processing all JSON files in directory: ${inputPath}\n`);
    const files = fs.readdirSync(inputPath)
      .filter(f => f.endsWith('.json') && f !== 'README.json')
      .map(f => path.join(inputPath, f));

    if (files.length === 0) {
      console.error('No JSON files found in directory');
      process.exit(1);
    }

    files.forEach((file, index) => {
      console.log(`\n[${index + 1}/${files.length}] Processing: ${path.basename(file)}`);
      extractHtmlFromJson(file);
    });

    console.log(`\n✓ Processed ${files.length} file(s)`);
  } else {
    extractHtmlFromJson(inputPath);
  }
}

main();
