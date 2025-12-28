import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_ROOT = join(__dirname, '../data/html');

/**
 * Encode URL to Base64 URL-safe ID
 * Removes https:// prefix before encoding
 */
export function urlToId(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return Buffer.from(withoutScheme).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); // Remove padding
}

/**
 * Decode Base64 ID back to URL
 * Prepends https:// after decoding
 */
export function idToUrl(id: string): string {
  // Restore base64 padding and characters
  const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const withoutScheme = Buffer.from(base64 + padding, 'base64').toString('utf-8');
  return `https://${withoutScheme}`;
}

/**
 * Get cache file path for a URL
 * Example: https://tech.kakao.com/posts/123
 *   -> data/html/tech.kakao.com/dGVjaC5rYWthby5jb20vcG9zdHMvMTIz.html
 */
export function getCachePath(url: string): string {
  const hostname = new URL(url).hostname;
  const id = urlToId(url);
  return join(CACHE_ROOT, hostname, `${id}.html`);
}

/**
 * Read cached HTML for a URL
 * Returns null if cache miss
 */
export async function readCache(url: string): Promise<string | null> {
  const cachePath = getCachePath(url);
  try {
    await access(cachePath);
    return await readFile(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write HTML to cache for a URL
 * Creates directory structure if needed
 */
export async function writeCache(url: string, html: string): Promise<void> {
  const cachePath = getCachePath(url);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, html, 'utf-8');
}
