// Mission Control — local server.
// Zero dependencies: Node's http module serves the UI, a JSON API, and a
// Server-Sent Events stream that pushes live agent updates to the browser.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(ROOT, process.env.AGENTS_CONFIG || 'agents.config.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const HOST = process.env.HOST || config.host || '127.0.0.1';
const PORT = Number(process.env.PORT || config.port || 4317);

// ───────────────────────────── agent registry ─────────────────────────────
const agents = new Map();
const activity = [];
const clients = new Set();
const startedAt = Date.now();

function broadcast(evt) {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) res.write(data);
}

async function loadAgents() {
  for (const cfg of config.agents || []) {
    if (cfg.enabled === false) continue;
    if (!cfg.id || !/^[a-z0-9][a-z0-9_-]*$/i.test(cfg.id)) { console.error(`Skipping agent with invalid id: ${cfg.id}`); continue; }
    const file = path.join(__dirname, 'adapters', `${cfg.adapter || cfg.id}.js`);
    try {
      const { default: Adapter } = await import(pathToFileURL(file).href);
      const agent = new Adapter(cfg, { rootDir: ROOT, dataDir: DATA });
      agent.on('event', (evt) => {
        if (evt.type === 'activity') {
          activity.unshift(evt.item);
          if (activity.length > 200) activity.length = 200;
        }
        broadcast(evt);
      });
      agents.set(agent.id, agent);
      console.log(`  ✓ ${agent.name.padEnd(18)} adapter=${cfg.adapter || cfg.id}  workspace=${agent.workspaceRoot}`);
    } catch (err) {
      console.error(`  ✗ Failed to load agent "${cfg.id}" (${file}): ${err.message}`);
    }
  }
}

async function checkAllHealth() {
  await Promise.all([...agents.values()].map(async (a) => {
    const before = a.health.online;
    await a.refreshHealth();
    if (before !== a.health.online && a.health.checkedAt) {
      a.activityFeed(a.health.online ? 'online' : 'offline', a.health.online ? 'Came online' : `Went offline — ${a.health.detail}`);
    }
  }));
}

// ───────────────────────────────── http ─────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

async function readBody(req, limit = 25 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

// This server can run commands on your machine, so only talk to pages served
// from itself: block other websites (CSRF) and DNS-rebinding tricks.
function isTrusted(req) {
  const hostHeader = (req.headers.host || '').toLowerCase();
  const hostname = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const localNames = new Set(['localhost', '127.0.0.1', '::1', HOST.toLowerCase()]);
  if (!localNames.has(hostname)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    try {
      const o = new URL(origin);
      if (!localNames.has(o.hostname.replace(/^\[|\]$/g, '')) || String(o.port || 80) !== String(PORT)) return false;
    } catch { return false; }
  }
  return true;
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA fallback
  const file = path.resolve(PUBLIC, '.' + rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function getAgent(id) {
  const a = agents.get(id);
  if (!a) throw Object.assign(new Error(`No agent "${id}"`), { status: 404 });
  return a;
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;
  const q = url.searchParams;

  if (parts[0] === 'events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'hello', agents: [...agents.values()].map((a) => a.snapshot()), activity: activity.slice(0, 60) })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (parts[0] === 'system' && m === 'GET') {
    return send(res, 200, {
      hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, node: process.version,
      startedAt, uptimeMs: Date.now() - startedAt, loadavg: os.loadavg(), cpus: os.cpus().length,
      memory: { total: os.totalmem(), free: os.freemem() },
    });
  }

  if (parts[0] === 'activity' && m === 'GET') return send(res, 200, activity);

  if (parts[0] !== 'agents') return send(res, 404, { error: 'Unknown endpoint' });
  if (parts.length === 1 && m === 'GET') return send(res, 200, [...agents.values()].map((a) => a.snapshot()));

  const agent = getAgent(parts[1]);
  const action = parts[2] || '';
  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? await readBody(req) : {};

  switch (`${m} ${action}`) {
    case 'GET ': return send(res, 200, agent.snapshot());
    case 'GET messages': return send(res, 200, agent.messages);
    case 'POST messages': return send(res, 202, await agent.send(body.text));
    case 'POST stop': return send(res, 200, { stopped: agent.interrupt() });
    case 'POST pause': agent.setPaused(body.paused !== false); return send(res, 200, agent.snapshot());
    case 'POST reset': agent.reset({ clearHistory: !!body.clearHistory }); return send(res, 200, agent.snapshot());
    case 'POST health': await agent.refreshHealth(); return send(res, 200, agent.snapshot());
    case 'PUT settings': return send(res, 200, agent.updateSettings(body));
    case 'GET logs': return send(res, 200, agent.logs);
    case 'GET files': return send(res, 200, await agent.listDir(q.get('path') || ''));
    case 'GET file': return send(res, 200, await agent.readFile(q.get('path') || ''));
    case 'PUT file': return send(res, 200, await agent.writeFile(body.path, body.content, { encoding: body.encoding }));
    case 'DELETE file': return send(res, 200, await agent.deletePath(q.get('path') || body.path));
    case 'POST mkdir': return send(res, 200, await agent.makeDir(body.path));
    case 'POST rename': return send(res, 200, await agent.renamePath(body.from, body.to));
    default: return send(res, 404, { error: `Unknown action ${m} ${action}` });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (!isTrusted(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden: Mission Control only accepts requests from localhost.'); }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
        return send(res, 415, { error: 'Use Content-Type: application/json' });
      }
      return await api(req, res, url);
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.message });
    else res.end();
    if (!err.status || err.status >= 500) console.error(err);
  }
});

console.log('\n  ✳ Mission Control — loading agents');
await loadAgents();
await checkAllHealth();
setInterval(checkAllHealth, 60_000);

server.listen(PORT, HOST, () => {
  console.log(`\n  Dashboard running at  http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}\n`);
});

function shutdown() {
  for (const a of agents.values()) a.interrupt();
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
