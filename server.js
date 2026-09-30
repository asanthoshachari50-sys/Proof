'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, 'data', 'proof.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-me';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || `http://localhost:${PORT}/api/auth/github/callback`;

function readDb() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { users: [], assessments: [] }; } }
function writeDb(db) { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function parseBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) reject(new Error('Payload too large')); }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } }); }); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`${salt}:${key.toString('hex')}`))); }
function verifyPassword(password, stored) { const [salt, saved] = stored.split(':'); return hashPassword(password, salt).then(value => crypto.timingSafeEqual(Buffer.from(value.split(':')[1], 'hex'), Buffer.from(saved, 'hex'))); }
function tokenFor(user) { const data = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString('base64url'); const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url'); return `${data}.${sig}`; }
function currentUser(req) { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const [data, sig] = token.split('.'); const expected = data ? crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url') : ''; if (!data || !sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; try { const payload = JSON.parse(Buffer.from(data, 'base64url')); return payload.exp > Date.now() ? readDb().users.find(u => u.id === payload.id) : null; } catch { return null; } }
function publicUser(user) { return { id: user.id, email: user.email, name: user.name || user.email.split('@')[0], github: user.github || null }; }
function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: 'Please sign in to continue.' }); return null; } return user; }
function serveFile(res, file) { const safe = path.normalize(file).replace(/^\.\.(?:[/\\]|$)/, ''); const full = path.join(PUBLIC_DIR, safe || 'index.html'); if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) return json(res, 404, { error: 'Not found' }); const type = full.endsWith('.html') ? 'text/html' : full.endsWith('.css') ? 'text/css' : full.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); fs.createReadStream(full).pipe(res); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const { email, password, name = '' } = await parseBody(req); if (!/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8) return json(res, 400, { error: 'Use a valid email and a password of at least 8 characters.' });
      const db = readDb(); if (db.users.some(u => u.email === email.toLowerCase())) return json(res, 409, { error: 'An account with this email already exists.' });
      const user = { id: crypto.randomUUID(), email: email.toLowerCase(), name: String(name).slice(0, 80), passwordHash: await hashPassword(password), createdAt: new Date().toISOString() }; db.users.push(user); writeDb(db); return json(res, 201, { token: tokenFor(user), user: publicUser(user) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = await parseBody(req); const user = readDb().users.find(u => u.email === String(email).toLowerCase()); if (!user || !await verifyPassword(password || '', user.passwordHash)) return json(res, 401, { error: 'Email or password is incorrect.' }); return json(res, 200, { token: tokenFor(user), user: publicUser(user) });
    }
    if (req.method === 'GET' && url.pathname === '/api/me') { const user = requireUser(req, res); if (user) json(res, 200, { user: publicUser(user) }); return; }
    if (req.method === 'PATCH' && url.pathname === '/api/profile/github') { const user = requireUser(req, res); if (!user) return; const { github } = await parseBody(req); if (!/^https:\/\/(www\.)?github\.com\/[A-Za-z0-9-]+\/?$/.test(github || '')) return json(res, 400, { error: 'Enter a public GitHub profile URL.' }); const db = readDb(); Object.assign(db.users.find(u => u.id === user.id), { github }); writeDb(db); return json(res, 200, { user: publicUser(currentUser(req)) }); }
    if (req.method === 'POST' && url.pathname === '/api/assessments') { const user = requireUser(req, res); if (!user) return; const { repo, answers } = await parseBody(req); if (!/^https:\/\/(www\.)?github\.com\/.+\/.+/.test(repo || '') || !Array.isArray(answers) || answers.length !== 4) return json(res, 400, { error: 'Provide a repository and all four answers.' }); const quality = answers.reduce((n, a) => n + (String(a).trim().length >= 50 ? 25 : String(a).trim().length >= 20 ? 15 : 5), 0); const score = Math.min(100, quality); const cert = `PRF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; const assessment = { id: crypto.randomUUID(), userId: user.id, repo, answers: answers.map(a => String(a).trim()), score, certificateId: cert, createdAt: new Date().toISOString() }; const db = readDb(); db.assessments.push(assessment); writeDb(db); return json(res, 201, { assessment }); }
    if (req.method === 'GET' && url.pathname === '/api/assessments/latest') { const user = requireUser(req, res); if (!user) return; const assessment = readDb().assessments.filter(a => a.userId === user.id).at(-1); return json(res, 200, { assessment: assessment || null }); }
    if (req.method === 'GET' && url.pathname === '/api/auth/github') { if (!GITHUB_CLIENT_ID) return json(res, 503, { error: 'GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' }); const state = crypto.randomBytes(18).toString('hex'); res.writeHead(302, { 'Set-Cookie': `proof_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`, Location: `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=read:user&state=${state}` }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/auth/github/callback') return json(res, 501, { error: 'OAuth callback wiring is ready; complete this endpoint with your GitHub app redirect and token exchange before production.' });
    if (req.method === 'GET') return serveFile(res, url.pathname === '/' ? 'index.html' : url.pathname);
    json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); json(res, error.message === 'Invalid JSON' ? 400 : 500, { error: 'Something went wrong. Please try again.' }); }
});
server.listen(PORT, () => console.log(`Proof is running at http://localhost:${PORT}`));
module.exports = { hashPassword, verifyPassword, tokenFor };
