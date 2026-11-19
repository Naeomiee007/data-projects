import { h, markdown, toast, clock } from '../ui.js';
import { store, on, api, loadMessages } from '../store.js';

const SUGGESTIONS = [
  'Look around this workspace and tell me what you find.',
  'Create a README.md describing this project.',
  'Write a Python script that summarizes a CSV file.',
  'Review the most recently changed files for bugs.',
];

export function renderChat(root, id) {
  const list = h('div.messages');
  const scroller = h('div.chat-scroll', {}, list);
  const input = h('textarea.composer-input', { rows: 1, placeholder: 'Message the agent…   (Enter to send, Shift+Enter for a new line)' });
  const sendBtn = h('button.btn.primary.send', { title: 'Send' }, 'Send ↵');
  const hint = h('div.composer-hint');
  const nodes = new Map(); // messageId → element

  root.append(h('div.chat', {},
    scroller,
    h('div.composer', {},
      h('div.composer-box', {}, input, sendBtn),
      hint)));

  // Pick up a draft handed over by the Workspace tab ("Ask about this file").
  const draft = sessionStorage.getItem(`draft:${id}`);
  if (draft) { input.value = draft; sessionStorage.removeItem(`draft:${id}`); }

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; };
  input.addEventListener('input', autosize);
  setTimeout(() => { autosize(); input.focus(); }, 0);

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };

  async function send(text = input.value) {
    text = text.trim();
    if (!text) return;
    try {
      input.value = '';
      autosize();
      await api(`/agents/${id}/messages`, { method: 'POST', body: { text } });
      toBottom();
    } catch (e) {
      input.value = text;
      toast(e.message, 'error');
    }
  }
  sendBtn.onclick = () => send();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });

  const updateComposer = () => {
    const a = store.agents.get(id);
    const busy = a?.state === 'working';
    const blocked = !a?.online || a?.paused;
    sendBtn.disabled = busy || blocked;
    input.disabled = blocked;
    hint.replaceChildren(
      busy ? `${a.name} is working. You can send your next message when this run finishes.`
        : !a?.online ? `Offline: ${a?.health?.detail || ''}`
          : a?.paused ? 'Paused. Resume this agent in the Control Room to chat.'
            : h('span', {}, a.session?.sessionId ? `Continuing session ${a.session.sessionId.slice(0, 8)}` : 'New session', ' · working in ', h('code', {}, a.workspace)));
  };

  function renderMessage(m) {
    const el = m.role === 'user'
      ? h('div.msg.user', {}, h('div.bubble', {}, m.parts.map((p) => p.text).join('\n')), h('div.msg-meta', {}, clock(m.ts)))
      : h(`div.msg.assistant.st-${m.status}`, {},
        h('div.msg-avatar', {}, store.agents.get(id)?.meta.icon),
        h('div.msg-body', {},
          ...m.parts.map((p, i) => (p.type === 'text' ? h('div.md', { 'data-part': i, html: markdown(p.text) }) : toolChip(p))),
          m.status === 'streaming' && !m.parts.length ? h('div.typing', {}, h('span'), h('span'), h('span')) : null,
          m.status === 'error' ? h('div.msg-error', {}, '⚠ ', m.error || 'The run failed.') : null,
          m.status === 'stopped' ? h('div.msg-note', {}, '■ Stopped') : null,
          m.meta?.deniedTools?.length ? h('div.msg-warn', {}, `🔒 Blocked by the permission mode: ${m.meta.deniedTools.join(', ')}. To let it through, change the permission mode or add allowed tools in the `,
            h('a', { href: `#/agents/${id}/control` }, 'Control Room'), '.') : null,
          h('div.msg-meta', {}, clock(m.ts),
            m.usage ? ` · ${(m.usage.outputTokens || 0).toLocaleString()} tokens out` : '',
            m.usage?.costUsd ? ` · $${m.usage.costUsd.toFixed(3)}` : '',
            m.meta?.durationMs ? ` · ${(m.meta.durationMs / 1000).toFixed(1)}s` : '')));
    const prev = nodes.get(m.id);
    if (prev) {
      // Keep expanded tool details open across re-renders.
      const open = [...prev.querySelectorAll('details[open]')].map((d) => d.dataset.id);
      for (const oid of open) el.querySelector(`details[data-id="${CSS.escape(oid)}"]`)?.setAttribute('open', '');
      prev.replaceWith(el);
    } else list.append(el);
    nodes.set(m.id, el);
  }

  function renderAll(msgs) {
    nodes.clear();
    list.replaceChildren();
    if (!msgs.length) {
      const a = store.agents.get(id);
      list.append(h('div.chat-empty', {},
        h('div.agent-avatar.xl', { style: { '--c': a?.meta.color } }, a?.meta.icon),
        h('h2', {}, `Chat with ${a?.name}`),
        h('p.muted', {}, a?.meta.description),
        h('div.suggestions', {}, SUGGESTIONS.map((s) => h('button.suggestion', { onclick: () => send(s) }, s)))));
    }
    msgs.forEach(renderMessage);
    toBottom();
  }

  // Coalesce streaming deltas into one paint per frame.
  const pending = new Set();
  let raf = 0;
  const schedule = (mid) => {
    pending.add(mid);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const stick = nearBottom();
      const msgs = store.messages.get(id) || [];
      for (const pid of pending) {
        const m = msgs.find((x) => x.id === pid);
        const el = nodes.get(pid);
        if (!m) continue;
        // Fast path: only the trailing text part changed.
        const lastIdx = m.parts.length - 1;
        const partEl = el?.querySelector(`.md[data-part="${lastIdx}"]`);
        if (partEl && m.parts[lastIdx]?.type === 'text' && m.status === 'streaming') partEl.innerHTML = markdown(m.parts[lastIdx].text);
        else renderMessage(m);
      }
      pending.clear();
      if (stick) toBottom();
    });
  };

  loadMessages(id).then(renderAll).catch((e) => toast(e.message, 'error'));
  updateComposer();

  const off = on((evt) => {
    if (evt.agentId !== id && evt.agent?.id !== id && evt.type !== 'hello') return;
    if (evt.type === 'chat:upsert') {
      if (!nodes.size) list.replaceChildren(); // drop the empty state
      const stick = nearBottom();
      renderMessage(evt.message);
      if (stick || evt.message.role === 'user') toBottom();
    }
    if (evt.type === 'chat:delta') schedule(evt.messageId);
    if (evt.type === 'chat:reset' || evt.type === 'chat:reload') loadMessages(id, true).then(renderAll);
    if (evt.type === 'agent' || evt.type === 'hello') updateComposer();
  });

  return () => { off(); cancelAnimationFrame(raf); };
}

function toolChip(p) {
  const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  const inputStr = p.input?.command || p.input?.file_path || p.input?.pattern || p.input?.url || p.input?.query || '';
  return h(`details.tool.t-${p.status}`, { 'data-id': p.id },
    h('summary', {},
      h('span.tool-status'),
      h('span.tool-name', {}, p.name),
      h('span.tool-label', {}, p.label && p.label !== `Using ${p.name}` ? p.label : String(inputStr).slice(0, 120))),
    h('div.tool-detail', {},
      h('div.tool-section', {}, 'Input'),
      h('pre', {}, fmt(p.input ?? {})),
      p.output != null ? [h('div.tool-section', {}, p.status === 'error' ? 'Error' : 'Output'), h('pre', {}, p.output)] : null));
}
