import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_ROOT = join(__dirname, '../data/html');

/**
 * Generate SHA-1 hash ID from URL
 * Removes https:// prefix before hashing
 * Returns 40-character hex string
 */
export function urlToId(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return createHash('sha1').update(withoutScheme).digest('hex');
}

/**
 * Get cache file path for a URL
 * Example: https://tech.kakao.com/posts/123
 *   -> data/html/tech.kakao.com/9c1db1dd793047d9cbe4bccb1f4dc6a2af59f020.html
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
