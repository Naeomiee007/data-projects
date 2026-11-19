// Small UI toolkit: DOM builder, formatting, markdown, toasts, modals.

export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sv != null) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function duration(ms) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

export const money = (n) => '$' + (Number(n) || 0).toFixed((Number(n) || 0) < 10 ? 2 : 0);

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const STATE_LABEL = { working: 'Working', idle: 'Online', offline: 'Offline', paused: 'Paused', error: 'Error' };

export function statusPill(state) {
  return h(`span.pill.s-${state}`, {}, h('span.dot'), STATE_LABEL[state] || state);
}

// ─────────────────────────────── markdown ───────────────────────────────
// Deliberately small: fenced code, inline code, headings, lists, quotes,
// bold/italic, links, tables-as-pre. Everything is escaped first.
export function markdown(src = '') {
  const blocks = [];
  src = String(src).replace(/```([\w+-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (_, lang, code) => {
    blocks.push(`<pre class="code"><div class="code-head"><span>${esc(lang || 'text')}</span><button class="copy" data-copy>Copy</button></div><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };

  for (const line of src.split('\n')) {
    const block = line.match(/^\u0000(\d+)\u0000$/);
    const head = line.match(/^(#{1,4})\s+(.*)/);
    const ul = line.match(/^\s*[-*+]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const quote = line.match(/^>\s?(.*)/);
    if (block) { flushPara(); flushList(); out.push(blocks[+block[1]]); }
    else if (head) { flushPara(); flushList(); out.push(`<h${head[1].length + 2}>${inline(head[2])}</h${head[1].length + 2}>`); }
    else if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
    } else if (quote) { flushPara(); flushList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); }
    else if (/^\s*\|.*\|\s*$/.test(line)) { flushList(); flushPara(); out.push(`<pre class="table">${esc(line)}</pre>`); }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join('').replace(/<\/pre><pre class="table">/g, '\n');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const code = btn.closest('pre')?.querySelector('code');
  if (!code) return;
  navigator.clipboard?.writeText(code.textContent).then(() => {
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = 'Copy'), 1200);
  });
});

// ─────────────────────────────── toasts & modals ───────────────────────────────
export function toast(msg, kind = 'info') {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts' }); document.body.append(wrap); }
  const t = h(`div.toast.t-${kind}`, {}, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4200);
}

export function modal({ title, body, actions = [] }) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 150); resolve(v); };
    const overlay = h('div.overlay', { onclick: (e) => e.target === overlay && close(null) },
      h('div.modal', {},
        h('div.modal-head', {}, h('h3', {}, title), h('button.icon-btn', { onclick: () => close(null), title: 'Close' }, '✕')),
        h('div.modal-body', {}, body),
        actions.length ? h('div.modal-foot', {}, actions.map((a) => h(`button.btn${a.kind ? '.' + a.kind : ''}`, { onclick: () => close(a.value ?? a.label) }, a.label))) : null));
    document.body.append(overlay);
    const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); } };
    document.addEventListener('keydown', onKey);
    overlay.querySelector('input, textarea')?.focus();
  });
}

export async function prompt(title, { label = '', value = '', placeholder = '' } = {}) {
  const input = h('input.input', { value, placeholder });
  const res = modal({
    title,
    body: h('label.field', {}, label ? h('span', {}, label) : null, input),
    actions: [{ label: 'Cancel', value: null }, { label: 'OK', kind: 'primary', value: '__ok' }],
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.closest('.modal').querySelector('.btn.primary').click(); });
  setTimeout(() => { input.focus(); input.select(); }, 30);
  return (await res) === '__ok' ? input.value.trim() : null;
}

export async function confirm(title, text, { danger = false, ok = 'Confirm' } = {}) {
  return (await modal({ title, body: h('p.muted', {}, text), actions: [{ label: 'Cancel', value: false }, { label: ok, kind: danger ? 'danger' : 'primary', value: true }] })) === true;
}
