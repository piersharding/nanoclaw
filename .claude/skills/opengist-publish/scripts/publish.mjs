#!/usr/bin/env node
/**
 * opengist-publish — create a gist on an OpenGist instance via git push.
 *
 * Environment variables (required):
 *   OPENGIST_URL       Base URL of the OpenGist instance
 *   OPENGIST_USER      OpenGist username
 *   OPENGIST_PASSWORD  OpenGist account password
 *
 * Environment variables (gist inputs):
 *   GIST_TITLE         Human-readable title (used to derive slug)
 *   GIST_VISIBILITY    'public' | 'unlisted' | 'private'  (default: unlisted)
 *   GIST_FILES         JSON array of file objects:
 *                        [{"path":"/abs/path"}]           — read from disk
 *                        [{"filename":"f.md","content":"…"}]  — inline content
 *                        or a mix of both
 *
 * Outputs JSON to stdout:
 *   { url, slug, title, visibility, files[] }
 */

import { execSync }                          from 'child_process';
import { writeFileSync, mkdirSync, rmSync,
         readFileSync, existsSync }          from 'fs';
import { basename, join }                    from 'path';
import { tmpdir }                            from 'os';
import { randomBytes }                       from 'crypto';

// ── Read config ───────────────────────────────────────────────────────────────
const BASE_URL  = (process.env.OPENGIST_URL  ?? '').replace(/\/$/, '');
const USER      = process.env.OPENGIST_USER      ?? '';
const PASSWORD  = process.env.OPENGIST_PASSWORD  ?? '';

if (!BASE_URL || !USER || !PASSWORD) {
  console.error('Missing required env vars: OPENGIST_URL, OPENGIST_USER, OPENGIST_PASSWORD');
  process.exit(1);
}

// ── Read gist inputs ──────────────────────────────────────────────────────────
const TITLE_RAW  = process.env.GIST_TITLE      || `report-${new Date().toISOString().slice(0,10)}`;
const VISIBILITY = process.env.GIST_VISIBILITY || 'unlisted';
const FILES_RAW  = process.env.GIST_FILES      || '[]';

const VIS_MAP = { public: '0', unlisted: '1', private: '2' };
const visValue = VIS_MAP[VISIBILITY] ?? '1';

// ── Parse files ───────────────────────────────────────────────────────────────
let fileDefs;
try {
  fileDefs = JSON.parse(FILES_RAW);
} catch {
  console.error('GIST_FILES must be valid JSON');
  process.exit(1);
}

const files = fileDefs.map(f => {
  if (f.path) {
    if (!existsSync(f.path)) { console.error(`File not found: ${f.path}`); process.exit(1); }
    return { filename: basename(f.path), content: readFileSync(f.path, 'utf8') };
  }
  if (!f.filename || f.content == null) {
    console.error('Each file object needs either "path" or both "filename" and "content"');
    process.exit(1);
  }
  return { filename: f.filename, content: f.content };
});

if (files.length === 0) { console.error('GIST_FILES is empty — provide at least one file'); process.exit(1); }

// ── Build slug ────────────────────────────────────────────────────────────────
const baseSlug = TITLE_RAW
  .toLowerCase()
  .replace(/[^\w\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 60)
  .replace(/^-|-$/g, '') || `report-${Date.now()}`;

// ── Cookie helpers ────────────────────────────────────────────────────────────
// Extract name=value pairs from Set-Cookie headers, merging and respecting Max-Age=0 deletions.
function parseCookies(setCookieHeaders) {
  const jar = new Map();
  for (const h of setCookieHeaders) {
    const [pair, ...directives] = h.split(';').map(s => s.trim());
    const [name, ...rest] = pair.split('=');
    const isDeleted = directives.some(d => /^max-age=0$/i.test(d));
    if (isDeleted) jar.delete(name);
    else           jar.set(name, rest.join('='));
  }
  return [...jar.entries()].map(([k,v]) => `${k}=${v}`).join('; ');
}

// ── Login early (needed for authenticated slug check) ─────────────────────────
const loginPageResp = await fetch(`${BASE_URL}/login`, { redirect: 'manual' });
const jar0  = parseCookies(loginPageResp.headers.getSetCookie?.() ?? []);
const csrf1 = (await loginPageResp.text()).match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
if (!csrf1) { console.error('Could not read CSRF token from login page'); process.exit(1); }

const loginResp = await fetch(`${BASE_URL}/login`, {
  method:   'POST',
  headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': jar0 },
  body:     new URLSearchParams({ _csrf: csrf1, username: USER, password: PASSWORD }).toString(),
  redirect: 'manual',
});
// Merge: parse jar0 first, then layer login response cookies on top
const allCookies = parseCookies([
  ...(loginPageResp.headers.getSetCookie?.() ?? []),
  ...(loginResp.headers.getSetCookie?.()      ?? []),
]);

// ── Check slug uniqueness (authenticated — works for unlisted/private gists) ──
async function slugExists(s) {
  try {
    // OpenGist does not honour HEAD for gist pages — use GET with early abort
    const ac = new AbortController();
    const r  = await fetch(`${BASE_URL}/${USER}/${s}`, {
      headers: { 'Cookie': allCookies },
      redirect: 'manual',
      signal:  ac.signal,
    });
    ac.abort(); // cancel body download
    return r.status !== 404;
  } catch (e) {
    if (e.name === 'AbortError') return true; // connection established → gist exists
    return false; // network error → assume free
  }
}

let slug = baseSlug;
if (await slugExists(slug)) {
  slug = `${baseSlug}-${Math.floor(Date.now() / 1000)}`;
  process.stderr.write(`Slug already taken — using "${slug}"\n`);
}

// ── Create temp git repo and push ─────────────────────────────────────────────
const tmpDir = join(tmpdir(), 'og-' + randomBytes(4).toString('hex'));
mkdirSync(tmpDir, { recursive: true });

try {
  const run = (cmd) => execSync(cmd, { cwd: tmpDir, stdio: 'pipe' });

  run('git init');
  run('git config user.email "smegol@local"');
  run('git config user.name "smegol"');

  for (const f of files) {
    writeFileSync(join(tmpDir, f.filename), f.content, 'utf8');
  }

  run('git add .');
  run(`git commit -m "${TITLE_RAW.replace(/"/g, "'")}"`);

  const encodedPW = encodeURIComponent(PASSWORD);
  const remote = `${BASE_URL.replace('https://', `https://${USER}:${encodedPW}@`)}/${USER}/${slug}`;

  try {
    execSync(`git push "${remote}" HEAD:refs/heads/master 2>&1`, { cwd: tmpDir, stdio: 'inherit' });
  } catch (e) {
    console.error('git push failed:', e.message);
    process.exit(1);
  }

  const gistURL = `${BASE_URL}/${USER}/${slug}`;

  // ── Set visibility ────────────────────────────────────────────────────────
  // Get fresh gist-page CSRF (session already established above)
  const gistEditResp = await fetch(`${gistURL}/edit`, { headers: { 'Cookie': allCookies } });
  const csrf2        = (await gistEditResp.text()).match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf2) throw new Error('Login failed — could not load gist edit page (check credentials)');

  // Set visibility
  await fetch(`${gistURL}/visibility`, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': allCookies },
    body:     new URLSearchParams({ _csrf: csrf2, private: visValue }).toString(),
    redirect: 'manual',
  });

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(JSON.stringify({
    url:        gistURL,
    slug,
    title:      TITLE_RAW,
    visibility: VISIBILITY,
    files:      files.map(f => f.filename),
  }, null, 2));

} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
