// replace debug_sgo.ts temporarily with this minimal version
import 'dotenv/config';
import fetch from 'node-fetch';

const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2/events';

async function main() {
  const apiKey = process.env.SGO_API_KEY;
  if (!apiKey) throw new Error('Missing SGO_API_KEY in environment');

  const url = new URL(SGO_BASE_URL);
  url.searchParams.set('apiKey', apiKey);

  const res = await fetch(url.toString());
  const text = await res.text();

  console.log('Status:', res.status, res.statusText);
  console.log('Body snippet:', text.slice(0, 500));
}

main().catch((err) => {
  console.error('debug_sgo basic failed', err);
  process.exit(1);
});
