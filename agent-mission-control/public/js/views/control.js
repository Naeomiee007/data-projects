import { h, toast, confirm, compact, money, duration, timeAgo, clock, STATE_LABEL } from '../ui.js';
import { store, on, api, loadLogs } from '../store.js';

export function renderControl(root, id) {
  const statusPanel = h('div.panel.cr-status');
  const controls = h('div.panel.cr-controls');
  const stats = h('div.cr-stats');
  const form = h('form.panel.cr-settings');
  const consoleEl = h('div.console.mono');
  const filterSel = h('select.input.sm', {}, ['all', 'event', 'info', 'stderr', 'error'].map((v) => h('option', { value: v }, v === 'all' ? 'All output' : v)));
  let showRaw = false;
  const rawToggle = h('label.check', {}, h('input', { type: 'checkbox', onchange: (e) => { showRaw = e.target.checked; drawConsole(); } }), 'Raw JSON');

  root.append(h('div.control-room', {},
    h('div.cr-top', {}, statusPanel, controls),
    stats,
    h('div.cr-bottom', {},
      form,
      h('div.panel.cr-console', {},
        h('div.panel-head', {}, h('h3', {}, 'Console'), h('div.row', {}, rawToggle, filterSel, h('button.btn.sm.ghost', { onclick: () => loadLogs(id).then(drawConsole) }, '↻'))),
        consoleEl))));

  const act = (path, body = {}, msg) => api(`/agents/${id}/${path}`, { method: 'POST', body }).then(() => msg && toast(msg, 'ok')).catch((e) => toast(e.message, 'error'));

  function drawStatus() {
    const a = store.agents.get(id);
    if (!a) return;
    const row = (k, v) => h('div.kv', {}, h('span.k', {}, k), h('span.v', {}, v ?? '—'));
    statusPanel.replaceChildren(
      h('div.panel-head', {}, h('h3', {}, 'Status')),
      h(`div.big-state.s-${a.state}`, {}, h('span.big-dot'), h('div', {}, h('div.big-label', {}, STATE_LABEL[a.state]), h('div.muted', {}, a.activity))),
      h('div.kvs', {},
        row('Health', a.health?.detail),
        row('Last check', a.health?.checkedAt ? timeAgo(a.health.checkedAt) : 'never'),
        row('Current task', a.currentTask || 'none'),
        row('Run time', a.runStartedAt ? h('span', { 'data-since': a.runStartedAt }, duration(Date.now() - a.runStartedAt)) : '—'),
        row('Session', a.session?.sessionId ? h('span.mono', {}, a.session.sessionId) : 'new on next message'),
        a.session?.model ? row('Model', h('span.mono', {}, a.session.model)) : null,
        row('Workspace', h('span.mono', {}, a.workspace)),
        a.lastError ? row('Last error', h('span.err', {}, a.lastError)) : null));

    controls.replaceChildren(
      h('div.panel-head', {}, h('h3', {}, 'Controls')),
      h('div.ctrl-grid', {},
        ctrl('■', 'Stop run', 'Interrupt the current task', a.state !== 'working', () => act('stop', {}, 'Stop signal sent'), 'danger'),
        a.paused
          ? ctrl('▶', 'Resume', 'Accept new tasks again', false, () => act('pause', { paused: false }, 'Agent resumed'))
          : ctrl('⏸', 'Pause', 'Reject new tasks until resumed', false, () => act('pause', { paused: true }, 'Agent paused')),
        ctrl('✦', 'New session', 'Start a fresh conversation (keeps history)', a.state === 'working', () => act('reset', {}, 'Fresh session started')),
        ctrl('⌫', 'Clear history', 'New session and wipe the chat log', a.state === 'working', async () => {
          if (await confirm('Clear chat history?', `This deletes the saved conversation with ${a.name}. Files in the workspace are not touched.`, { danger: true, ok: 'Clear' })) act('reset', { clearHistory: true }, 'History cleared');
        }),
        ctrl('♥', 'Health check', 'Ping the agent now', false, () => act('health', {}, 'Health check complete')),
        ctrl('🗂', 'Open workspace', 'Browse and edit files', false, () => { location.hash = `#/agents/${id}/files`; })));

    const s = a.stats;
    const tile = (label, value, hint) => h('div.kpi', {}, h('div.kpi-label', {}, label), h('div.kpi-value', {}, value), h('div.kpi-hint', {}, hint));
    stats.replaceChildren(
      tile('Runs', compact(s.runs), `${s.errors} failed`),
      tile('Success rate', s.runs ? `${Math.round(((s.runs - s.errors) / s.runs) * 100)}%` : '—', 'Of completed runs'),
      tile('Avg run time', s.runs ? duration(s.totalDurationMs / s.runs) : '—', `${duration(s.totalDurationMs)} total`),
      tile('Tokens in / out', `${compact(s.inputTokens)} / ${compact(s.outputTokens)}`, 'Includes cached context'),
      tile('Spend', money(s.costUsd), 'As reported by the agent'));
  }

  const ctrl = (icon, label, hint, disabled, onclick, kind = '') =>
    h(`button.ctrl${kind ? '.' + kind : ''}`, { disabled, onclick, type: 'button' }, h('span.ctrl-icon', {}, icon), h('span.ctrl-label', {}, label), h('span.ctrl-hint', {}, hint));

  function drawForm() {
    const a = store.agents.get(id);
    if (!a) return;
    const field = (f) => {
      const v = a.settings[f.key] ?? '';
      let input;
      if (f.type === 'select') input = h('select.input', { name: f.key }, f.options.map((o) => h('option', { value: o.value, selected: o.value === v }, o.label)));
      else if (f.type === 'textarea') input = h('textarea.input', { name: f.key, rows: 3, placeholder: f.placeholder || '', value: v });
      else if (f.type === 'toggle') input = h('input', { type: 'checkbox', name: f.key, checked: !!v });
      else input = h('input.input', { name: f.key, type: f.type === 'number' ? 'number' : 'text', placeholder: f.placeholder || '', value: v });
      return h('label.field', {}, h('span', {}, f.label), input, f.help ? h('small.muted', {}, f.help) : null);
    };
    form.replaceChildren(
      h('div.panel-head', {}, h('h3', {}, 'Configuration'), h('span.muted', {}, 'Applies to the next run')),
      h('label.field', {}, h('span', {}, 'Display name'), h('input.input', { name: 'name', value: a.name })),
      h('label.field', {}, h('span', {}, 'Workspace folder'), h('input.input.mono', { name: 'workspace', value: a.workspace }), h('small.muted', {}, 'Where the agent works and where the Workspace tab points. Absolute path or ~/…')),
      ...a.settingsSchema.map(field),
      h('div.form-foot', {}, h('button.btn.primary', { type: 'submit' }, 'Save configuration')));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    for (const el of form.elements) if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    try { await api(`/agents/${id}/settings`, { method: 'PUT', body: data }); toast('Configuration saved', 'ok'); }
    catch (err) { toast(err.message, 'error'); }
  });

  function logLine(entry) {
    const text = showRaw && entry.raw ? JSON.stringify(entry.raw) : entry.text;
    return h(`div.log.l-${entry.level}`, {}, h('span.log-ts', {}, clock(entry.ts)), h('span.log-lvl', {}, entry.level), h('span.log-text', {}, text));
  }
  const visible = (e) => filterSel.value === 'all' || e.level === filterSel.value;
  function drawConsole() {
    const logs = (store.logs.get(id) || []).filter(visible);
    consoleEl.replaceChildren(...(logs.length ? logs.slice(-300).map(logLine) : [h('div.muted', {}, 'No output yet. Logs from each run stream here live.')]));
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  filterSel.onchange = drawConsole;

  drawStatus();
  drawForm();
  loadLogs(id).then(drawConsole).catch(() => {});

  const tick = setInterval(() => {
    for (const el of statusPanel.querySelectorAll('[data-since]')) el.textContent = duration(Date.now() - Number(el.dataset.since));
  }, 1000);
  let lastSettings = JSON.stringify([store.agents.get(id)?.settings, store.agents.get(id)?.name, store.agents.get(id)?.workspace]);
  const off = on((evt) => {
    if (evt.type === 'agent' && evt.agent.id === id) {
      drawStatus();
      // Only redraw the form when settings changed server-side, so typing isn't interrupted.
      const now = JSON.stringify([evt.agent.settings, evt.agent.name, evt.agent.workspace]);
      if (now !== lastSettings && !form.contains(document.activeElement)) { lastSettings = now; drawForm(); }
    }
    if (evt.type === 'log' && evt.agentId === id && visible(evt.entry)) {
      if (consoleEl.firstChild?.classList?.contains('muted')) consoleEl.replaceChildren();
      const stick = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 60;
      consoleEl.append(logLine(evt.entry));
      while (consoleEl.childElementCount > 400) consoleEl.firstChild.remove();
      if (stick) consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  });
  return () => { clearInterval(tick); off(); };
}
