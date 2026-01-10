# UI Modernization Plan for postby.io

## Current Issues (from screenshots)
1. **Excessive card spacing** - CardHeader/CardContent use `p-8` (32px padding)
2. **Header too prominent** - Title is 5xl/6xl, description is too large
3. **Weak visual hierarchy** - Title and summary compete for attention
4. **Bland colors** - Plain grey/white without personality
5. **Cards feel empty** - Too much whitespace inside cards

## Design Approach

Following the Refactoring UI principles:
- "Size isn't everything" - Use font weight and color for hierarchy
- "Add color with accent borders" - Add company-colored left borders
- "Use fewer borders" - Rely on shadows and background colors
- "Greys don't have to be grey" - Add subtle warmth to greys

## Changes to Make

### File: `src/pages/index.astro`

#### 1. Header Redesign
- Reduce title from `text-5xl sm:text-6xl` to `text-3xl sm:text-4xl`
- Add gradient/accent color to brand name for visual interest
- Reduce description size from `text-lg` to `text-base`
- Lighten description color for better hierarchy

#### 2. Card Redesign
- Override card padding: `p-5` instead of `p-8`
- Add left accent border (4px) with company color
- Tighter spacing between elements
- Remove CardHeader/CardContent/CardFooter separation - use single unified layout

#### 3. Typography Hierarchy
- Badge: Keep small, use `size="sm"`
- Date: Smaller, lighter color (`text-xs text-gray-400`)
- Title: `text-base font-semibold` instead of CardTitle's `text-xl`
- Summary: `text-sm text-gray-500` with 2-line clamp
- "Read more": Remove button wrapper, use simple link

#### 4. Company Colors (for left border accents)
```javascript
const companyColors = {
  toss: 'border-l-blue-500',
  coupang: 'border-l-red-500',
  daangn: 'border-l-orange-400',
  kakao: 'border-l-yellow-400',
  naver: 'border-l-green-500',
  line: 'border-l-green-400',
  woowahan: 'border-l-cyan-500',
};
```

#### 5. Overall Layout
- Reduce max-width from `max-w-4xl` to `max-w-2xl` for better readability
- Reduce gap between cards from `space-y-6` to `space-y-4`
- Softer background: `bg-slate-50` instead of gradient

## Expected Result
- Compact, modern cards with colored left accents
- Clear hierarchy: Company badge → Title (focus) → Summary (secondary)
- Header that doesn't dominate the page
- Warmer, more inviting color palette

## Verification
1. Run `pnpm dev` to start development server
2. Visit `localhost:4321` to preview changes
3. Check responsiveness on mobile viewport
4. Verify all company badges show correct accent colors
