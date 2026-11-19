import { h, statusPill, toast, duration } from '../ui.js';
import { store, on, api } from '../store.js';
import { renderChat } from './chat.js';
import { renderFiles } from './files.js';
import { renderControl } from './control.js';

const TABS = [
  { id: 'chat', label: 'Chat', icon: '💬', render: renderChat },
  { id: 'files', label: 'Workspace', icon: '🗂', render: renderFiles },
  { id: 'control', label: 'Control room', icon: '🎛', render: renderControl },
];

export function renderAgent(root, id, tabId) {
  const agent = store.agents.get(id);
  if (!agent) { root.append(h('div.loading', {}, 'Connecting to agent…')); return () => {}; }
  const tab = TABS.find((t) => t.id === tabId) || TABS[0];

  const pillSlot = h('span');
  const activity = h('span.head-activity-text');
  const spinner = h('span');
  const timer = h('span.mono.muted');
  const stopBtn = h('button.btn.danger.sm', {
    onclick: () => api(`/agents/${id}/stop`, { method: 'POST', body: {} }).then(() => toast('Stop signal sent')).catch((e) => toast(e.message, 'error')),
  }, '■ Stop run');

  const head = h('header.agent-head', { style: { '--c': agent.meta.color } },
    h('div.agent-head-main', {},
      h('div.agent-avatar.lg', {}, agent.meta.icon),
      h('div', {},
        h('div.eyebrow', {}, h('a', { href: '#/' }, 'Mission Control'), ' / ', agent.meta.displayName),
        h('h1', {}, agent.name),
        h('div.head-activity', {}, pillSlot, spinner, activity, timer))),
    h('div.head-actions', {}, stopBtn));

  const tabs = h('nav.tabs', {}, TABS.map((t) =>
    h('a.tab', { href: `#/agents/${id}/${t.id}`, class: t.id === tab.id ? 'active' : '' }, h('span', {}, t.icon), t.label)));

  const body = h('div.tab-body');
  root.append(h('div.agent-page', { style: { '--c': agent.meta.color } }, head, tabs, body));

  const update = () => {
    const a = store.agents.get(id);
    if (!a) return;
    pillSlot.replaceChildren(statusPill(a.state));
    activity.textContent = a.state === 'working' ? a.activity : a.state === 'offline' ? a.health?.detail : a.activity;
    spinner.className = a.state === 'working' ? 'spinner' : '';
    stopBtn.style.display = a.state === 'working' ? '' : 'none';
    timer.textContent = a.state === 'working' && a.runStartedAt ? ` · ${duration(Date.now() - a.runStartedAt)}` : '';
  };
  update();
  const tick = setInterval(update, 1000);
  const off = on((evt) => { if (evt.type === 'agent' && evt.agent.id === id) update(); });
  const tabCleanup = tab.render(body, id);

  return () => { clearInterval(tick); off(); tabCleanup?.(); };
}
