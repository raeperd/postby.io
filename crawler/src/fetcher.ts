export async function fetchPage(url: string): Promise<{ html: string; url: string; statusCode: number }> {
  const response = await fetch(url);
  const html = await response.text();

  return {
    html,
    url: response.url,
    statusCode: response.status,
  };
}
