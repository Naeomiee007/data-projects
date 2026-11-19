// BaseAgent — the shared contract every agent in Mission Control follows.
//
// The base class owns everything that is the same for every agent:
//   • status + "what is it doing right now"   (state, activity, currentTask)
//   • chat history, persisted to data/<id>.json
//   • a sandboxed file workspace               (list/read/write/mkdir/delete/rename)
//   • control-room plumbing                    (settings, pause, stop, reset, stats, logs)
//   • events that are streamed live to the browser
//
// An adapter (e.g. claude-code.js) only has to implement:
//   static meta                 → name, icon, colour, description
//   settingsSchema()            → fields shown in the Control Room
//   async healthCheck()         → { online, version?, detail? }
//   async execute(prompt, run)  → do the work, reporting through the `run` helpers
//   stop()                      → interrupt the current execution (optional)
//
// See adapters/_template.js for a fully commented starting point.

import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MAX_MESSAGES = 400;
const MAX_LOGS = 400;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);

export const uid = () => crypto.randomUUID();

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export class BaseAgent extends EventEmitter {
  static meta = {
    type: 'base',
    displayName: 'Agent',
    description: '',
    icon: '◆',
    color: '#7c8cff',
  };

  constructor(config, ctx) {
    super();
    this.id = config.id;
    this.config = config;
    this.ctx = ctx; // { rootDir, dataDir }
    this.name = config.name || this.constructor.meta.displayName;

    const defaults = Object.fromEntries(this.settingsSchema().map((f) => [f.key, f.default ?? '']));
    this.settings = { ...defaults, ...(config.settings || {}) };
    this.workspaceRoot = this.#resolveWorkspace(config.workspace || `./workspaces/${this.id}`);

    this.state = 'idle'; // idle | working | paused | error | offline
    this.paused = false;
    this.health = { online: false, checkedAt: null, detail: 'Not checked yet' };
    this.activity = 'Standing by';
    this.currentTask = null;
    this.runStartedAt = null;
    this.lastActiveAt = null;
    this.lastError = null;
    this.messages = [];
    this.logs = [];
    this.touchedFiles = [];
    this.stats = { runs: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, totalDurationMs: 0 };
    this.session = {};

    this.#load();
    fssync.mkdirSync(this.workspaceRoot, { recursive: true });
    // Optional starter files (instructions, reference docs). Copied once; never overwrites existing files.
    if (config.seed) {
      try { fssync.cpSync(path.resolve(ctx.rootDir, config.seed), this.workspaceRoot, { recursive: true, force: false, errorOnExist: false }); }
      catch (e) { console.error(`[${this.id}] could not copy seed files: ${e.message}`); }
    }
  }

  // ───────────────────────── adapter hooks (override these) ─────────────────────────
  settingsSchema() { return []; }
  async healthCheck() { return { online: true, detail: 'Always on' }; }
  // eslint-disable-next-line no-unused-vars
  async execute(prompt, run) { throw new Error('execute() not implemented'); }
  stop() {}
  resetSession() { this.session = {}; }

  // ───────────────────────────────── snapshot ─────────────────────────────────
  snapshot() {
    const meta = this.constructor.meta;
    return {
      id: this.id,
      name: this.name,
      type: meta.type,
      meta: { icon: this.config.icon || meta.icon, color: this.config.color || meta.color, description: meta.description, displayName: meta.displayName },
      state: this.computeState(),
      online: this.health.online,
      health: this.health,
      paused: this.paused,
      activity: this.activity,
      currentTask: this.currentTask,
      runStartedAt: this.runStartedAt,
      lastActiveAt: this.lastActiveAt,
      lastError: this.lastError,
      stats: this.stats,
      settings: this.settings,
      settingsSchema: this.settingsSchema(),
      workspace: this.workspaceRoot,
      session: this.session,
      touchedFiles: this.touchedFiles.slice(0, 25),
      messageCount: this.messages.length,
    };
  }

  computeState() {
    if (this.state === 'working') return 'working';
    if (!this.health.online) return 'offline';
    if (this.paused) return 'paused';
    if (this.state === 'error') return 'error';
    return 'idle';
  }

  // ─────────────────────────────── lifecycle ───────────────────────────────
  async refreshHealth() {
    try {
      const h = await this.healthCheck();
      this.health = { ...h, checkedAt: Date.now() };
    } catch (err) {
      this.health = { online: false, detail: err.message, checkedAt: Date.now() };
    }
    this.#changed();
    return this.health;
  }

  async send(text, { attachments } = {}) {
    if (this.state === 'working') throw httpError(409, `${this.name} is busy — stop the current run or wait for it to finish.`);
    if (this.paused) throw httpError(423, `${this.name} is paused. Resume it in the Control Room.`);
    if (!this.health.online) throw httpError(503, `${this.name} is offline: ${this.health.detail || 'unavailable'}`);
    if (!text || !text.trim()) throw httpError(400, 'Message is empty.');

    const userMsg = { id: uid(), role: 'user', ts: Date.now(), parts: [{ type: 'text', text }], attachments };
    const reply = { id: uid(), role: 'assistant', ts: Date.now(), parts: [], status: 'streaming' };
    this.#pushMessage(userMsg);
    this.#pushMessage(reply);

    this.state = 'working';
    this.lastError = null;
    this.runStartedAt = Date.now();
    this.currentTask = summarize(text, 90);
    this.activity = 'Thinking…';
    this.activityFeed('task', `New task: ${this.currentTask}`);
    this.#changed();

    const run = this.#runHelpers(reply);
    // Fire and forget — progress streams to clients through events.
    (async () => {
      try {
        await this.execute(text, run);
        if (reply.status === 'streaming') reply.status = 'done';
      } catch (err) {
        reply.status = reply.status === 'stopped' ? 'stopped' : 'error';
        if (reply.status === 'error') {
          reply.error = err.message;
          this.lastError = err.message;
          this.stats.errors++;
        }
      } finally {
        const dur = Date.now() - this.runStartedAt;
        this.stats.runs++;
        this.stats.totalDurationMs += dur;
        this.state = reply.status === 'error' ? 'error' : 'idle';
        this.activity = reply.status === 'error' ? `Error: ${summarize(reply.error || 'failed', 80)}`
          : reply.status === 'stopped' ? 'Stopped by operator' : 'Standing by';
        this.activityFeed(reply.status === 'error' ? 'error' : 'done',
          reply.status === 'error' ? `Run failed: ${summarize(reply.error || '', 100)}`
            : reply.status === 'stopped' ? 'Run stopped by operator' : `Finished in ${fmtDur(dur)}`);
        this.currentTask = null;
        this.runStartedAt = null;
        this.lastActiveAt = Date.now();
        this.#upsert(reply);
        this.#changed();
        this.#save();
      }
    })();

    return { userMessage: userMsg, reply };
  }

  interrupt() {
    if (this.state !== 'working') return false;
    const reply = [...this.messages].reverse().find((m) => m.role === 'assistant' && m.status === 'streaming');
    if (reply) reply.status = 'stopped';
    this.stop();
    return true;
  }

  setPaused(paused) {
    this.paused = !!paused;
    this.activityFeed('control', paused ? 'Agent paused' : 'Agent resumed');
    this.#changed();
    this.#save();
  }

  reset({ clearHistory = false } = {}) {
    if (this.state === 'working') throw httpError(409, 'Stop the current run before resetting.');
    this.resetSession();
    if (clearHistory) this.messages = [];
    this.state = 'idle';
    this.lastError = null;
    this.activityFeed('control', clearHistory ? 'Session reset and history cleared' : 'Started a fresh session');
    this.emit('event', { type: 'chat:reset', agentId: this.id });
    this.#changed();
    this.#save();
  }

  updateSettings(patch = {}) {
    const schema = this.settingsSchema();
    for (const field of schema) {
      if (!(field.key in patch)) continue;
      let v = patch[field.key];
      if (field.type === 'number') v = v === '' || v == null ? '' : Number(v);
      if (field.type === 'toggle') v = !!v;
      this.settings[field.key] = v;
    }
    if (typeof patch.name === 'string' && patch.name.trim()) this.name = patch.name.trim();
    if (typeof patch.workspace === 'string' && patch.workspace.trim()) {
      this.workspaceRoot = this.#resolveWorkspace(patch.workspace.trim());
      fssync.mkdirSync(this.workspaceRoot, { recursive: true });
    }
    this.activityFeed('control', 'Settings updated');
    this.#changed();
    this.#save();
    return this.snapshot();
  }

  // ─────────────────────────────── workspace ───────────────────────────────
  resolvePath(rel = '') {
    const clean = String(rel).replace(/^[/\\]+/, '');
    const abs = path.resolve(this.workspaceRoot, clean);
    if (abs !== this.workspaceRoot && !abs.startsWith(this.workspaceRoot + path.sep)) {
      throw httpError(403, 'Path escapes the agent workspace.');
    }
    return abs;
  }

  toRel(abs) { return path.relative(this.workspaceRoot, abs).split(path.sep).join('/'); }

  async listDir(rel = '') {
    const abs = this.resolvePath(rel);
    const entries = await fs.readdir(abs, { withFileTypes: true }).catch((e) => { throw httpError(404, e.message); });
    const touched = new Map(this.touchedFiles.map((t) => [t.path, t]));
    const out = [];
    for (const e of entries) {
      if (HIDDEN_DIRS.has(e.name)) continue;
      const full = path.join(abs, e.name);
      let st;
      try { st = await fs.stat(full); } catch { continue; }
      const relPath = this.toRel(full);
      out.push({
        name: e.name,
        path: relPath,
        type: st.isDirectory() ? 'dir' : 'file',
        size: st.size,
        mtime: st.mtimeMs,
        touched: touched.get(relPath)?.ts || null,
      });
    }
    out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    return { path: this.toRel(abs), root: this.workspaceRoot, entries: out };
  }

  async readFile(rel) {
    const abs = this.resolvePath(rel);
    const st = await fs.stat(abs).catch(() => { throw httpError(404, 'File not found.'); });
    if (st.isDirectory()) throw httpError(400, 'That is a folder.');
    if (st.size > MAX_FILE_BYTES) return { path: this.toRel(abs), size: st.size, tooLarge: true, mtime: st.mtimeMs };
    const buf = await fs.readFile(abs);
    const binary = buf.subarray(0, 8000).includes(0);
    return { path: this.toRel(abs), size: st.size, mtime: st.mtimeMs, binary, content: binary ? null : buf.toString('utf8') };
  }

  async writeFile(rel, content, { encoding = 'utf8' } = {}) {
    if (!rel) throw httpError(400, 'Path required.');
    const abs = this.resolvePath(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, encoding === 'base64' ? Buffer.from(content, 'base64') : String(content ?? ''));
    this.emit('event', { type: 'files:changed', agentId: this.id, path: this.toRel(abs) });
    return { ok: true, path: this.toRel(abs) };
  }

  async makeDir(rel) {
    const abs = this.resolvePath(rel);
    await fs.mkdir(abs, { recursive: true });
    this.emit('event', { type: 'files:changed', agentId: this.id, path: this.toRel(abs) });
    return { ok: true };
  }

  async deletePath(rel) {
    const abs = this.resolvePath(rel);
    if (abs === this.workspaceRoot) throw httpError(400, 'Refusing to delete the workspace root.');
    await fs.rm(abs, { recursive: true, force: true });
    this.emit('event', { type: 'files:changed', agentId: this.id, path: this.toRel(abs) });
    return { ok: true };
  }

  async renamePath(from, to) {
    const a = this.resolvePath(from);
    const b = this.resolvePath(to);
    await fs.mkdir(path.dirname(b), { recursive: true });
    await fs.rename(a, b);
    this.emit('event', { type: 'files:changed', agentId: this.id, path: this.toRel(b) });
    return { ok: true };
  }

  // ─────────────────────────── logging & activity ───────────────────────────
  log(level, text, raw) {
    const entry = { ts: Date.now(), level, text: String(text).slice(0, 4000) };
    if (raw !== undefined) entry.raw = raw;
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    this.emit('event', { type: 'log', agentId: this.id, entry });
  }

  activityFeed(kind, text) {
    this.emit('event', { type: 'activity', item: { id: uid(), agentId: this.id, agentName: this.name, kind, text, ts: Date.now() } });
  }

  noteTouchedFile(absOrRel, action) {
    if (!absOrRel) return;
    let rel = absOrRel;
    if (path.isAbsolute(absOrRel)) {
      const r = path.relative(this.workspaceRoot, absOrRel);
      if (r.startsWith('..') || path.isAbsolute(r)) return; // outside workspace
      rel = r.split(path.sep).join('/');
    }
    this.touchedFiles = [{ path: rel, action, ts: Date.now() }, ...this.touchedFiles.filter((t) => t.path !== rel)].slice(0, 50);
    if (action !== 'read') this.emit('event', { type: 'files:changed', agentId: this.id, path: rel });
  }

  // ──────────────────────────────── internals ────────────────────────────────
  #runHelpers(reply) {
    const self = this;
    const findTool = (id) => reply.parts.find((p) => p.type === 'tool' && p.id === id);
    return {
      reply,
      /** Append streamed text to the reply. */
      text(delta) {
        if (!delta) return;
        let last = reply.parts[reply.parts.length - 1];
        if (!last || last.type !== 'text') { last = { type: 'text', text: '' }; reply.parts.push(last); self.#upsert(reply); }
        last.text += delta;
        self.emit('event', { type: 'chat:delta', agentId: self.id, messageId: reply.id, partIndex: reply.parts.length - 1, text: delta });
      },
      /** Record a tool call. `label` becomes the live activity line. */
      tool({ id = uid(), name, input, label }) {
        reply.parts.push({ type: 'tool', id, name, input, label, status: 'running', ts: Date.now() });
        if (label) self.setActivity(label);
        self.#upsert(reply);
        return id;
      },
      toolResult(id, { output, isError = false } = {}) {
        const t = findTool(id);
        if (!t) return;
        t.status = isError ? 'error' : 'done';
        if (output != null) t.output = String(output).slice(0, 6000);
        self.#upsert(reply);
      },
      activity(text) { self.setActivity(text); },
      usage({ inputTokens = 0, outputTokens = 0, costUsd = 0 } = {}) {
        self.stats.inputTokens += inputTokens;
        self.stats.outputTokens += outputTokens;
        self.stats.costUsd += costUsd;
        reply.usage = { inputTokens, outputTokens, costUsd };
        self.#changed();
      },
      meta(obj) { Object.assign(reply, { meta: { ...(reply.meta || {}), ...obj } }); self.#upsert(reply); },
      log: (level, text, raw) => self.log(level, text, raw),
      touched: (p, action) => self.noteTouchedFile(p, action),
    };
  }

  setActivity(text) {
    this.activity = summarize(text, 120);
    this.#changed();
  }

  #pushMessage(m) {
    this.messages.push(m);
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    this.#upsert(m);
  }

  #upsert(m) { this.emit('event', { type: 'chat:upsert', agentId: this.id, message: m }); }

  #changedTimer = null;
  #changed() {
    // Coalesce bursts of updates (streaming) into ~10 snapshots/sec.
    if (this.#changedTimer) return;
    this.#changedTimer = setTimeout(() => {
      this.#changedTimer = null;
      this.emit('event', { type: 'agent', agent: this.snapshot() });
    }, 100);
  }

  #resolveWorkspace(p) { return path.resolve(this.ctx.rootDir, expandHome(p)); }

  get #file() { return path.join(this.ctx.dataDir, `${this.id}.json`); }

  #load() {
    try {
      const saved = JSON.parse(fssync.readFileSync(this.#file, 'utf8'));
      Object.assign(this.settings, saved.settings || {});
      if (saved.name) this.name = saved.name;
      if (saved.workspace) this.workspaceRoot = saved.workspace;
      this.messages = (saved.messages || []).map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m));
      this.stats = { ...this.stats, ...(saved.stats || {}) };
      this.session = saved.session || {};
      this.paused = !!saved.paused;
      this.lastActiveAt = saved.lastActiveAt || null;
      this.touchedFiles = saved.touchedFiles || [];
    } catch { /* first run */ }
  }

  #saveTimer = null;
  #save() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      const data = {
        name: this.name, settings: this.settings, workspace: this.workspaceRoot, messages: this.messages,
        stats: this.stats, session: this.session, paused: this.paused, lastActiveAt: this.lastActiveAt,
        touchedFiles: this.touchedFiles,
      };
      fs.mkdir(this.ctx.dataDir, { recursive: true })
        .then(() => fs.writeFile(this.#file, JSON.stringify(data, null, 2)))
        .catch((e) => console.error(`[${this.id}] failed to save state:`, e.message));
    }, 300);
  }
  save() { this.#save(); }
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function summarize(text, n = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtDur(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
