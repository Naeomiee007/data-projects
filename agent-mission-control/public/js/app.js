import { h, $, statusPill } from './ui.js';
import { store, on, connect } from './store.js';
import { renderMission } from './views/mission.js';
import { renderAgent } from './views/agent.js';

const main = $('#main');
const nav = $('#agent-nav');
let cleanup = null;

function route() {
  const [, section, id, tab] = (location.hash.replace(/^#/, '') || '/').split('/');
  cleanup?.();
  cleanup = null;
  main.replaceChildren();
  main.scrollTop = 0;
  if (section === 'agents' && id) {
    if (!store.agents.has(id) && store.agents.size) { location.hash = '#/'; return; }
    cleanup = renderAgent(main, id, tab || 'chat');
  } else {
    cleanup = renderMission(main);
  }
  renderNav();
}

function renderNav() {
  const [, section, id] = location.hash.replace(/^#/, '').split('/');
  $('#nav-overview').classList.toggle('active', section !== 'agents');
  nav.replaceChildren(...[...store.agents.values()].map((a) =>
    h('a.nav-item', { href: `#/agents/${a.id}/chat`, class: section === 'agents' && id === a.id ? 'active' : '' },
      h('span.nav-icon', { style: { '--c': a.meta.color } }, a.meta.icon),
      h('span.nav-label', {}, a.name),
      h(`span.nav-dot.s-${a.state}`, { title: a.state }))));
  if (!store.agents.size) nav.append(h('div.nav-empty', {}, 'No agents loaded'));
}

function renderConn() {
  const el = $('#conn');
  el.className = `conn ${store.connected ? 'ok' : 'down'}`;
  el.lastChild.textContent = store.connected ? 'Live' : 'Reconnecting…';
}

let firstHello = true;
on((evt) => {
  if (evt.type === 'connection') renderConn();
  if (evt.type === 'hello') { renderConn(); if (firstHello) { firstHello = false; route(); } else renderNav(); }
  if (evt.type === 'agent') renderNav();
});

window.addEventListener('hashchange', route);
connect();
// Render immediately even before the first snapshot arrives.
route();

// Exported for the "add agent" modal and others.
export { statusPill };
