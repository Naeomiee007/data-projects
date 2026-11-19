# ✳ Agent Mission Control

A local dashboard for running AI agents from your browser. It starts with **Claude Code** and is built so you can add more agents using the same pattern.

- **Mission Control homepage**: shows every agent's live status (online, working, paused, offline, error) and what each one is doing right now. It also has fleet-wide totals and a live activity feed.
- **Chat panel** for each agent: replies stream in as they're written. Each tool call (file edits, shell commands, searches) is shown and can be expanded. Follow-up messages continue the same session.
- **File workspace** for each agent: browse, edit, create, rename, upload (drag and drop) and delete files. Files the agent just touched are highlighted, and an open file reloads when the agent changes it.
- **Control room** for each agent: stop a run, pause/resume, start a new session, clear history, run a health check, see usage stats (runs, success rate, tokens, spend), change settings, and watch a live console of the agent's raw events.

No build step and no `npm install`: it only uses Node's standard library.

## Run it

Requirements: **Node.js 18+**, and for the Claude Code agent, the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and logged in (`claude` works in your terminal).

```bash
cd agent-mission-control
npm start
```

Then open **http://localhost:4317**.

To change the port: `PORT=5000 npm start` (or edit `agents.config.json`).

## How Claude Code is wired up

Each chat message runs `claude -p --output-format stream-json` inside the agent's workspace folder (default `./workspaces/claude-code`). The live event stream feeds the chat, the activity ticker and the console. The session id is saved, so the next message continues the same conversation with `--resume`.

You can change these in the Control Room:

| Setting | What it does |
|---|---|
| Workspace folder | Where Claude works. Point it at any project, e.g. `~/code/my-app`. |
| Model | `opus`, `sonnet`, a full model id, or blank for your CLI default. |
| Permission mode | Headless runs **can't ask you for approval**, so anything the mode doesn't allow gets blocked. The chat tells you when that happens. *Accept edits* (the default) lets it edit files but not run shell commands. |
| Extra allowed tools | Allow specific commands without opening everything up, e.g. `Bash(python3 *) Bash(npm test)`. |
| Standing instructions | Added to the system prompt on every run. |

## Adding more agents

Every agent is an **adapter** (a small JS class) plus an **entry in `agents.config.json`**. The dashboard builds the card, chat, workspace and control room from those two pieces, so you don't change any frontend code.

**Another Claude Code instance** (for example, one per repo) only needs a config entry:

```json
{
  "id": "claude-docs",
  "adapter": "claude-code",
  "name": "Claude · Docs",
  "workspace": "~/projects/docs",
  "settings": { "model": "sonnet", "permissionMode": "acceptEdits" }
}
```

**A new kind of agent** (another CLI, an HTTP API, a local model):

```bash
cp server/adapters/_template.js server/adapters/my-agent.js
```

Then implement the four methods:

```js
static meta = { type, displayName, description, icon, color };
settingsSchema()            // fields shown in the Control Room
async healthCheck()         // → { online, version?, detail? }
async execute(prompt, run)  // do the work; report via run.text(), run.tool(), run.activity(), run.usage()…
stop()                      // interrupt
```

Register it with `"adapter": "my-agent"` and restart. The template is a working demo agent; try it with `{ "id": "echo", "adapter": "_template", "name": "Echo Bot" }`.

**Give an agent a role and background knowledge.** Add `"seed": "./agent-seeds/<name>"` to its config entry. The files in that folder are copied into the agent's workspace the first time it starts (existing files are never overwritten). For Claude Code agents, a `CLAUDE.md` in the workspace is read on every run, so it's the place for the agent's job description and reference documents (`@HANDOFF.md` pulls another file in). The included `distressedprops` agent is an example: it carries the DistressedProps CRM/Make/ActiveCampaign handoff and works through it with you.

Set `"enabled": false` on an entry to hide that agent without deleting it.

## Project layout

```
agent-mission-control/
├── agents.config.json        ← your agents
├── server/
│   ├── index.js              ← HTTP server, JSON API, live event stream (SSE)
│   └── adapters/
│       ├── base.js           ← shared behaviour: status, chat, files, controls, persistence
│       ├── claude-code.js    ← Claude Code adapter
│       └── _template.js      ← copy this to add a new agent type
├── public/                   ← the dashboard (plain HTML/CSS/JS modules)
├── data/                     ← saved chat history, sessions & stats (git-ignored)
└── workspaces/               ← default agent workspaces (git-ignored)
```

## Security notes

The dashboard can run an agent that edits files and executes commands on your computer, so:

- It listens on **127.0.0.1 only** by default. Don't change `host` to `0.0.0.0` unless you understand the risk.
- It rejects requests from other websites (Origin check) and DNS-rebinding attempts (Host check). API writes must be JSON.
- The workspace file browser is confined to the agent's workspace folder.
- Be careful with the *Bypass* permission mode: it lets Claude run any command without asking.

## API (for scripts)

| Method & path | Purpose |
|---|---|
| `GET /api/agents` | All agent snapshots |
| `POST /api/agents/:id/messages` `{text}` | Send a task |
| `POST /api/agents/:id/stop` | Interrupt the current run |
| `POST /api/agents/:id/pause` `{paused}` | Pause or resume |
| `POST /api/agents/:id/reset` `{clearHistory}` | New session |
| `PUT /api/agents/:id/settings` | Update settings |
| `GET /api/agents/:id/files?path=` · `GET/PUT/DELETE /api/agents/:id/file` | Workspace files |
| `GET /api/events` | Live Server-Sent Events stream |
