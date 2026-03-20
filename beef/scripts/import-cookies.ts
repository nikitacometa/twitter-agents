/**
 * Import Twitter cookies from browser DevTools.
 *
 * Usage:
 *   npx tsx scripts/import-cookies.ts <auth_token> <ct0> <twid>
 *
 * How to get cookies:
 *   1. Login to https://x.com in your browser
 *   2. Open DevTools (F12) → Application → Cookies → https://x.com
 *   3. Copy values of: auth_token, ct0, twid
 *   4. Run this script with those values
 */

import { writeFileSync } from 'node:fs';

const [authToken, ct0, twid] = process.argv.slice(2);

if (!authToken || !ct0 || !twid) {
  console.error('Usage: npx tsx scripts/import-cookies.ts <auth_token> <ct0> <twid>');
  console.error('');
  console.error('Get these from browser DevTools → Application → Cookies → https://x.com');
  process.exit(1);
}

const cookies = [
  `auth_token=${authToken}; Domain=.x.com; Path=/; Secure; HttpOnly`,
  `ct0=${ct0}; Domain=.x.com; Path=/; Secure`,
  `twid=${twid}; Domain=.x.com; Path=/; Secure`,
];

const path = './data/twitter-cookies.json';
writeFileSync(path, JSON.stringify(cookies, null, 2), 'utf-8');
console.log(`✓ Cookies saved to ${path}`);
console.log(`  auth_token: ${authToken.slice(0, 8)}...`);
console.log(`  ct0: ${ct0.slice(0, 8)}...`);
console.log(`  twid: ${twid.slice(0, 8)}...`);
console.log('');
console.log('Now run: npx tsx scripts/test-scraper.ts');
