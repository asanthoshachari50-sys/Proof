'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const fallbackFile = process.env.VERCEL ? '/tmp/proof.json' : path.join(process.cwd(), 'data', 'proof.json');
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const key = 'proof:database:v1';
const emptyDb = () => ({ users: [], assessments: [] });

async function kv(command, ...args) {
  const response = await fetch(`${kvUrl}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${kvToken}` } });
  if (!response.ok) throw new Error(`KV request failed (${response.status})`);
  return response.json();
}

async function readDb() {
  if (kvUrl && kvToken) {
    const result = await kv('get', key);
    return result.result ? JSON.parse(result.result) : emptyDb();
  }
  try { return JSON.parse(await fs.readFile(fallbackFile, 'utf8')); } catch { return emptyDb(); }
}

async function writeDb(db) {
  if (kvUrl && kvToken) { await kv('set', key, JSON.stringify(db)); return; }
  await fs.mkdir(path.dirname(fallbackFile), { recursive: true });
  await fs.writeFile(fallbackFile, JSON.stringify(db, null, 2));
}

module.exports = { readDb, writeDb, isDurable: Boolean(kvUrl && kvToken) };
