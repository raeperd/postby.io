export async function fetchPage(url: string): Promise<{ html: string; url: string; statusCode: number }> {
  // TODO: Implement HTTP fetching using native fetch() API
  console.log(`[FETCHER] fetchPage called for: ${url}`)
  
  return {
    html: '<html><body>Mock HTML content</body></html>',
    url: url,
    statusCode: 200
  }
}
