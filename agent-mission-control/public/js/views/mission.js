import { h, timeAgo, duration, compact, money, statusPill, clock, modal, esc } from '../ui.js';
import { store, on, api } from '../store.js';

const KIND_ICON = { task: '▸', done: '✓', error: '!', control: '⚙', online: '●', offline: '○' };

export function renderMission(root) {
  const clockEl = h('span.mono');
  const hostEl = h('span');
  const kpis = h('div.kpis');
  const grid = h('div.agent-grid');
  const feed = h('div.feed');

  root.append(
    h('header.page-head', {},
      h('div', {},
        h('div.eyebrow', {}, 'Operations overview'),
        h('h1', {}, 'Mission Control'),
        h('div.sub', {}, clockEl, h('span.sep', {}, '·'), hostEl)),
      h('div.head-actions', {},
        h('button.btn.ghost', { onclick: () => Promise.all([...store.agents.keys()].map((id) => api(`/agents/${id}/health`, { method: 'POST', body: {} }))) }, '↻  Check all agents'),
        h('button.btn.primary', { onclick: showAddAgent }, '＋  Add agent'))),
    kpis,
    h('div.mission-layout', {},
      h('section', {}, h('div.section-title', {}, h('h2', {}, 'Agents'), h('span.muted', {}, 'Live status from every connected agent')), grid),
      h('aside.panel.feed-panel', {}, h('div.section-title', {}, h('h2', {}, 'Activity'), h('span.live-tag', {}, h('span.dot'), 'live')), feed)));

  api('/system').then((s) => { hostEl.textContent = `${s.hostname} · ${s.platform} · Node ${s.node}`; }).catch(() => {});

  const renderKpis = () => {
    const list = [...store.agents.values()];
    const online = list.filter((a) => a.online).length;
    const working = list.filter((a) => a.state === 'working').length;
    const sum = (k) => list.reduce((n, a) => n + (a.stats?.[k] || 0), 0);
    const tile = (label, value, hint, cls = '') => h(`div.kpi${cls}`, {}, h('div.kpi-label', {}, label), h('div.kpi-value', {}, value), h('div.kpi-hint', {}, hint));
    kpis.replaceChildren(
      tile('Agents online', h('span', {}, String(online), h('small', {}, ` / ${list.length}`)), online === list.length && list.length ? 'All systems nominal' : `${list.length - online} offline`, online ? '.ok' : ''),
      tile('Working now', String(working), working ? list.filter((a) => a.state === 'working').map((a) => a.name).join(', ') : 'Everyone is idle', working ? '.busy' : ''),
      tile('Runs completed', compact(sum('runs')), `${sum('errors')} failed`),
      tile('Tokens processed', compact(sum('inputTokens') + sum('outputTokens')), `${compact(sum('outputTokens'))} generated`),
      tile('Spend', money(sum('costUsd')), 'As reported by agents'));
  };

  const renderGrid = () => {
    const cards = [...store.agents.values()].map(agentCard);
    cards.push(h('button.agent-card.add-card', { onclick: showAddAgent },
      h('div.add-plus', {}, '＋'), h('div.add-title', {}, 'Add an agent'), h('div.muted', {}, 'Same pattern: one adapter file, one config entry.')));
    grid.replaceChildren(...cards);
  };

  const renderFeed = () => {
    if (!store.activity.length) { feed.replaceChildren(h('div.empty-mini', {}, 'Nothing yet. Give an agent a task and its activity will appear here.')); return; }
    feed.replaceChildren(...store.activity.slice(0, 60).map((it) => {
      const a = store.agents.get(it.agentId);
      return h(`a.feed-item.k-${it.kind}`, { href: `#/agents/${it.agentId}/chat` },
        h('span.feed-icon', {}, KIND_ICON[it.kind] || '•'),
        h('div.feed-body', {},
          h('div.feed-text', {}, it.text),
          h('div.feed-meta', {}, h('span', { style: { color: a?.meta.color } }, it.agentName), ' · ', h('span', { title: new Date(it.ts).toLocaleString() }, timeAgo(it.ts)))));
    }));
  };

  const renderAll = () => { renderKpis(); renderGrid(); renderFeed(); };
  renderAll();

  // Running timers and "x ago" text tick once a second without a full re-render.
  const tick = setInterval(() => {
    clockEl.textContent = new Date().toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    for (const el of grid.querySelectorAll('[data-since]')) el.textContent = duration(Date.now() - Number(el.dataset.since));
    for (const el of grid.querySelectorAll('[data-ago]')) el.textContent = timeAgo(Number(el.dataset.ago));
  }, 1000);
  clockEl.textContent = new Date().toLocaleString();

  const off = on((evt) => {
    if (evt.type === 'agent' || evt.type === 'hello') { renderKpis(); renderGrid(); }
    if (evt.type === 'activity' || evt.type === 'hello') renderFeed();
  });
  return () => { clearInterval(tick); off(); };
}

function agentCard(a) {
  const base = `#/agents/${a.id}`;
  const working = a.state === 'working';
  return h(`article.agent-card.s-${a.state}`, { style: { '--c': a.meta.color } },
    h('div.card-glow'),
    h('div.card-top', {},
      h('div.agent-avatar', {}, a.meta.icon),
      h('div.card-title', {},
        h('a.agent-name', { href: `${base}/chat` }, a.name),
        h('div.agent-type', {}, a.meta.displayName, a.health?.version ? ` · ${a.health.version.split(' ')[0]}` : '')),
      statusPill(a.state)),

    h('div.now', {},
      h('div.now-label', {}, working ? 'Working on' : a.state === 'offline' ? 'Unavailable' : 'Status'),
      h('div.now-task', {}, working ? a.currentTask : a.state === 'offline' ? (a.health?.detail || 'Offline') : a.state === 'paused' ? 'Paused by operator' : a.state === 'error' ? 'Last run failed' : 'Ready for a task'),
      h('div.now-activity', {},
        working ? h('span.spinner') : h('span.idle-dot'),
        h('span.now-activity-text', {}, a.activity))),

    h('div.card-stats', {},
      stat(working ? 'Run time' : 'Last active', working ? h('span', { 'data-since': a.runStartedAt }, duration(Date.now() - a.runStartedAt)) : h('span', { 'data-ago': a.lastActiveAt || '' }, timeAgo(a.lastActiveAt))),
      stat('Runs', compact(a.stats.runs)),
      stat('Spend', money(a.stats.costUsd)),
      stat('Session', a.session?.sessionId ? h('span.mono', { title: a.session.sessionId }, a.session.sessionId.slice(0, 8)) : 'new')),

    h('div.card-actions', {},
      h('a.btn.sm', { href: `${base}/chat` }, '💬 Chat'),
      h('a.btn.sm', { href: `${base}/files` }, '🗂 Workspace'),
      h('a.btn.sm', { href: `${base}/control` }, '🎛 Control room')));
}

const stat = (label, value) => h('div.stat', {}, h('div.stat-label', {}, label), h('div.stat-value', {}, value));

function showAddAgent() {
  const step = (n, title, ...body) => h('div.step', {}, h('div.step-n', {}, n), h('div', {}, h('div.step-title', {}, title), ...body));
  const code = (s) => h('pre.code', {}, h('code', { html: esc(s) }));
  modal({
    title: 'Add another agent',
    body: h('div.steps', {},
      h('p.muted', {}, 'Every agent follows the same pattern. Mission Control builds its card, chat, workspace and control room from the adapter. You don\'t touch any frontend code.'),
      step('1', 'Another Claude Code instance (for example, a second repo)',
        h('p.muted', {}, 'Add an entry to ', h('code', {}, 'agents.config.json'), ' that reuses the existing adapter:'),
        code(`{
  "id": "claude-docs",
  "adapter": "claude-code",
  "name": "Claude · Docs",
  "workspace": "~/projects/docs",
  "settings": { "model": "sonnet" }
}`)),
      step('2', 'A brand-new kind of agent',
        h('p.muted', {}, 'Copy the template adapter and implement ', h('code', {}, 'healthCheck()'), ' and ', h('code', {}, 'execute()'), ':'),
        code('cp server/adapters/_template.js server/adapters/my-agent.js'),
        h('p.muted', {}, 'Then register it with ', h('code', {}, '"adapter": "my-agent"'), '.')),
      step('3', 'Restart the server', code('npm start'), h('p.muted', {}, 'The new agent appears here, live.'))),
    actions: [{ label: 'Got it', kind: 'primary' }],
  });
}

export { clock };
