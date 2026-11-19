import { h, toast, prompt, confirm, bytes, timeAgo } from '../ui.js';
import { store, on, api } from '../store.js';

const FILE_ICONS = { js: '🟨', ts: '🟦', py: '🐍', md: '📝', json: '🧾', html: '🌐', css: '🎨', csv: '📊', txt: '📄', sh: '⌨', png: '🖼', jpg: '🖼', svg: '🖼', ipynb: '📓', sql: '🗄' };
const iconFor = (e) => (e.type === 'dir' ? '📁' : FILE_ICONS[e.name.split('.').pop().toLowerCase()] || '📄');

export function renderFiles(root, id) {
  const expanded = new Set(['']);
  const cache = new Map(); // dir path → entries
  let current = null; // { path, content, original, info }

  const tree = h('div.tree');
  const crumb = h('div.crumb.mono');
  const editor = h('textarea.editor', { spellcheck: 'false', placeholder: 'Select a file on the left, or create a new one.' });
  const gutter = h('div.gutter.mono');
  const fileInfo = h('div.file-info');
  const saveBtn = h('button.btn.primary.sm', { onclick: () => save(), disabled: true }, 'Save  ⌘S');
  const recent = h('div.recent');
  const fileInput = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => upload(e.target.files) });

  const agent = store.agents.get(id);
  root.append(h('div.workspace', {},
    h('aside.panel.ws-side', {},
      h('div.ws-toolbar', {},
        h('div.ws-root', { title: agent?.workspace }, h('span.muted', {}, 'Workspace'), h('div.mono.ellipsis', {}, agent?.workspace)),
        h('div.ws-buttons', {},
          h('button.icon-btn', { title: 'New file', onclick: () => newFile() }, '＋'),
          h('button.icon-btn', { title: 'New folder', onclick: () => newFolder() }, '📁'),
          h('button.icon-btn', { title: 'Upload files', onclick: () => fileInput.click() }, '⇪'),
          h('button.icon-btn', { title: 'Refresh', onclick: () => refresh() }, '↻'))),
      tree,
      h('div.ws-recent', {}, h('div.section-mini', {}, 'Recently touched by agent'), recent),
      fileInput),
    h('section.panel.ws-main', {},
      h('div.editor-bar', {}, crumb, h('div.editor-actions', {},
        h('button.btn.sm.ghost', { onclick: () => askAgent(), title: 'Send this file to the chat' }, '💬 Ask agent'),
        h('button.btn.sm.ghost', { onclick: () => current && rename(current.path) }, 'Rename'),
        h('button.btn.sm.ghost.danger-text', { onclick: () => current && remove(current.path) }, 'Delete'),
        saveBtn)),
      h('div.editor-wrap', {}, gutter, editor),
      fileInfo)));

  // Drag & drop upload onto the tree.
  tree.addEventListener('dragover', (e) => { e.preventDefault(); tree.classList.add('drop'); });
  tree.addEventListener('dragleave', () => tree.classList.remove('drop'));
  tree.addEventListener('drop', (e) => { e.preventDefault(); tree.classList.remove('drop'); upload(e.dataTransfer.files); });

  async function loadDir(path) {
    const res = await api(`/agents/${id}/files?path=${encodeURIComponent(path)}`);
    cache.set(path, res.entries);
    return res.entries;
  }

  async function refresh() {
    await Promise.all([...expanded].map((p) => loadDir(p).catch(() => { expanded.delete(p); })));
    drawTree();
    drawRecent();
  }

  function drawTree() {
    const rows = [];
    const walk = (dir, depth) => {
      for (const e of cache.get(dir) || []) {
        const open = expanded.has(e.path);
        const fresh = e.touched && Date.now() - e.touched < 10 * 60 * 1000;
        rows.push(h('div.tree-row', {
          class: [current?.path === e.path ? 'active' : '', fresh ? 'fresh' : ''].join(' '),
          style: { paddingLeft: `${10 + depth * 14}px` },
          title: `${e.path}\n${e.type === 'file' ? bytes(e.size) + ' · ' : ''}modified ${timeAgo(e.mtime)}`,
          onclick: () => (e.type === 'dir' ? toggle(e.path) : openFile(e.path)),
        },
        h('span.caret', {}, e.type === 'dir' ? (open ? '▾' : '▸') : ''),
        h('span.ficon', {}, open ? '📂' : iconFor(e)),
        h('span.fname', {}, e.name),
        fresh ? h('span.fresh-dot', { title: 'Recently touched by the agent' }) : null));
        if (e.type === 'dir' && open) walk(e.path, depth + 1);
      }
    };
    walk('', 0);
    tree.replaceChildren(...(rows.length ? rows : [h('div.empty-mini', {}, 'This workspace is empty. Create a file, drop files here, or ask the agent to build something.')]));
  }

  function drawRecent() {
    const t = (store.agents.get(id)?.touchedFiles || []).slice(0, 8);
    recent.replaceChildren(...(t.length ? t.map((f) => h('div.recent-row', { onclick: () => openFile(f.path) },
      h('span.badge', { class: f.action === 'read' ? 'read' : 'edit' }, f.action === 'read' ? 'read' : 'edit'),
      h('span.mono.ellipsis', {}, f.path), h('span.muted', {}, timeAgo(f.ts))))
      : [h('div.empty-mini', {}, 'No file activity yet.')]));
  }

  async function toggle(path) {
    if (expanded.has(path)) expanded.delete(path);
    else { expanded.add(path); await loadDir(path).catch((e) => toast(e.message, 'error')); }
    drawTree();
  }

  async function openFile(path, { force = false } = {}) {
    if (!force && current && current.path !== path && dirty() && !(await confirm('Discard changes?', `You have unsaved changes in ${current.path}.`, { ok: 'Discard', danger: true }))) return;
    try {
      const f = await api(`/agents/${id}/file?path=${encodeURIComponent(path)}`);
      current = { path: f.path, original: f.content ?? '', info: f };
      // Make sure parent folders are expanded so the file is visible.
      const segs = f.path.split('/');
      for (let i = 1; i < segs.length; i++) { const p = segs.slice(0, i).join('/'); if (!expanded.has(p)) { expanded.add(p); await loadDir(p).catch(() => {}); } }
      editor.disabled = f.binary || f.tooLarge;
      editor.value = f.binary ? '(binary file — preview not available)' : f.tooLarge ? '(file is larger than 2 MB — open it in your editor)' : f.content;
      drawEditorChrome();
      drawTree();
    } catch (e) { toast(e.message, 'error'); }
  }

  const dirty = () => current && !current.info.binary && !current.info.tooLarge && editor.value !== current.original;

  function drawEditorChrome() {
    crumb.replaceChildren(...(current ? current.path.split('/').flatMap((s, i, arr) => [h('span', { class: i === arr.length - 1 ? 'crumb-last' : '' }, s), i < arr.length - 1 ? h('span.muted', {}, ' / ') : null].filter(Boolean)) : [h('span.muted', {}, 'No file open')]));
    if (dirty()) crumb.append(h('span.dirty', { title: 'Unsaved changes' }, ' ●'));
    saveBtn.disabled = !dirty();
    const lines = (editor.value.match(/\n/g) || []).length + 1;
    gutter.textContent = Array.from({ length: Math.min(lines, 20000) }, (_, i) => i + 1).join('\n');
    fileInfo.textContent = current ? `${bytes(current.info.size)} · ${lines} lines · modified ${timeAgo(current.info.mtime)}` : '';
  }

  editor.addEventListener('input', drawEditorChrome);
  editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; });
  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
    if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); drawEditorChrome(); }
  });

  async function save() {
    if (!current || !dirty()) return;
    try {
      await api(`/agents/${id}/file`, { method: 'PUT', body: { path: current.path, content: editor.value } });
      current.original = editor.value;
      current.info.size = new Blob([editor.value]).size;
      current.info.mtime = Date.now();
      drawEditorChrome();
      toast(`Saved ${current.path}`, 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }

  const baseDir = () => (current ? current.path.split('/').slice(0, -1).join('/') : '');
  const join = (dir, name) => (dir ? `${dir}/${name}` : name);

  async function newFile() {
    const name = await prompt('New file', { label: 'Path (relative to the workspace)', value: join(baseDir(), ''), placeholder: 'notes/todo.md' });
    if (!name) return;
    try { await api(`/agents/${id}/file`, { method: 'PUT', body: { path: name, content: '' } }); await refresh(); openFile(name, { force: true }); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function newFolder() {
    const name = await prompt('New folder', { label: 'Folder path', value: join(baseDir(), '') });
    if (!name) return;
    try { await api(`/agents/${id}/mkdir`, { method: 'POST', body: { path: name } }); expanded.add(name.replace(/\/$/, '')); await refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function rename(path) {
    const to = await prompt('Rename / move', { label: 'New path', value: path });
    if (!to || to === path) return;
    try { await api(`/agents/${id}/rename`, { method: 'POST', body: { from: path, to } }); await refresh(); openFile(to, { force: true }); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function remove(path) {
    if (!(await confirm('Delete file?', `This permanently deletes ${path} from the workspace.`, { danger: true, ok: 'Delete' }))) return;
    try {
      await api(`/agents/${id}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE', body: {} });
      current = null; editor.value = ''; drawEditorChrome(); await refresh();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function upload(files) {
    for (const f of files) {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f); });
      try { await api(`/agents/${id}/file`, { method: 'PUT', body: { path: join(baseDir(), f.name), content: b64, encoding: 'base64' } }); }
      catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
    if (files.length) toast(`Uploaded ${files.length} file(s)`, 'ok');
    refresh();
  }
  function askAgent() {
    if (!current) return toast('Open a file first.');
    sessionStorage.setItem(`draft:${id}`, `Take a look at \`${current.path}\` and `);
    location.hash = `#/agents/${id}/chat`;
  }

  refresh().then(() => {
    const first = store.agents.get(id)?.touchedFiles?.find((f) => f.action !== 'read');
    if (first) openFile(first.path).catch(() => {});
  }).catch((e) => toast(e.message, 'error'));
  drawEditorChrome();

  let refreshTimer = 0;
  const off = on((evt) => {
    if (evt.type === 'files:changed' && evt.agentId === id) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        await refresh();
        // Live-reload the open file if the agent changed it and we have no local edits.
        if (current && evt.path === current.path && !dirty()) openFile(current.path, { force: true });
      }, 250);
    }
    if (evt.type === 'agent' && evt.agent.id === id) drawRecent();
  });
  const warn = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => { off(); clearTimeout(refreshTimer); window.removeEventListener('beforeunload', warn); };
}
