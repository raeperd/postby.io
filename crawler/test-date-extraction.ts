import { extractPublishDate } from './src/selectors';
import fs from 'fs';

const html = `<div class="css-154r2lc esnk6d50">2025년 12월 24일</div>`;
const result = extractPublishDate(html, 'toss');

console.log('Test HTML:', html);
console.log('Extracted date:', result);
console.log('Expected: 2025-12-24');
