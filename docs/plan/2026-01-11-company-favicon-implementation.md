# Company Favicon Implementation

## Overview

Add company favicons to blog post cards in the index page to provide visual brand recognition for each post's source company.

## Approach

Use local favicon images downloaded from Google Favicon API. This provides:

- Fast loading (no external API calls per page view)
- Flexibility to add new companies (run script to download)
- Reliability (no dependency on external service at runtime)

## Implementation Steps

### Step 1: Create Favicon Download Script

Create `scripts/download-favicons.ts` with:

- Company domain mappings
- Fetch from Google Favicon API (`https://www.google.com/s2/favicons?domain=<domain>&sz=32`)
- Save to `public/favicons/<company>.png`

Company domains:
| Company | Domain |
|-----------|---------------------------|
| toss | toss.tech |
| coupang | coupang.com |
| daangn | daangn.com |
| kakao | tech.kakao.com |
| naver | d2.naver.com |
| line | techblog.lycorp.co.jp |
| woowahan | techblog.woowahan.com |

### Step 2: Add pnpm Command

Add to root `package.json`:

```json
"favicon": "tsx scripts/download-favicons.ts"
```

### Step 3: Download Favicons

Run `pnpm favicon` to download all company favicons to `public/favicons/`.

### Step 4: Update Index Page UI

Modify `src/pages/index.astro` to display favicons in the meta row:

```astro
<div class="mb-2 flex items-center gap-2">
  <img src={`/favicons/${post.company}.png`} alt="" class="h-4 w-4" loading="lazy" />
  <Badge ...>{post.company}</Badge>
  <time ...>{formatDate(post.publishedAt)}</time>
</div>
```

Design considerations:

- Small size (16x16) to support hierarchy without dominating
- Empty alt (decorative image, badge provides text)
- Lazy loading for performance
- Baseline aligned with text

## Verification

- `pnpm build` - Ensure static build succeeds
- `pnpm lint` - No linting errors
- Visual check - Favicons display correctly in dev server
