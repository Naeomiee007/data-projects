// Client state + live connection to the server (Server-Sent Events).

export const store = {
  agents: new Map(),
  activity: [],
  messages: new Map(), // agentId → message[]
  logs: new Map(),     // agentId → log[]
  connected: false,
  listeners: new Set(),
};

export function on(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }
function emit(evt) { for (const fn of store.listeners) { try { fn(evt); } catch (e) { console.error(e); } } }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function loadMessages(agentId, force = false) {
  if (!force && store.messages.has(agentId)) return store.messages.get(agentId);
  const msgs = await api(`/agents/${agentId}/messages`);
  store.messages.set(agentId, msgs);
  return msgs;
}

export async function loadLogs(agentId) {
  const logs = await api(`/agents/${agentId}/logs`);
  store.logs.set(agentId, logs);
  return logs;
}

export function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => { store.connected = true; emit({ type: 'connection' }); };
  es.onerror = () => { store.connected = false; emit({ type: 'connection' }); };
  es.onmessage = (m) => {
    const evt = JSON.parse(m.data);
    switch (evt.type) {
      case 'hello':
        store.agents = new Map(evt.agents.map((a) => [a.id, a]));
        store.activity = evt.activity;
        // Our cached chat may have missed events while disconnected.
        for (const id of store.messages.keys()) loadMessages(id, true).then(() => emit({ type: 'chat:reload', agentId: id }));
        break;
      case 'agent':
        store.agents.set(evt.agent.id, evt.agent);
        break;
      case 'activity':
        store.activity.unshift(evt.item);
        store.activity.length = Math.min(store.activity.length, 200);
        break;
      case 'chat:upsert': {
        const list = store.messages.get(evt.agentId);
        if (list) {
          const i = list.findIndex((x) => x.id === evt.message.id);
          if (i >= 0) list[i] = evt.message; else list.push(evt.message);
        }
        break;
      }
      case 'chat:delta': {
        const msg = store.messages.get(evt.agentId)?.find((x) => x.id === evt.messageId);
        const part = msg?.parts[evt.partIndex];
        if (part && part.type === 'text') part.text += evt.text;
        break;
      }
      case 'chat:reset':
        store.messages.delete(evt.agentId);
        break;
      case 'log': {
        const list = store.logs.get(evt.agentId);
        if (list) { list.push(evt.entry); if (list.length > 400) list.shift(); }
        break;
      }
    }
    emit(evt);
  };
  return es;
}
