// ─────────────────────────────────────────────────────────────────────────────
//  TEMPLATE ADAPTER — copy this file to add a new kind of agent.
//
//  1. cp server/adapters/_template.js server/adapters/my-agent.js
//  2. Rename the class, fill in `meta`, `settingsSchema`, `healthCheck`, `execute`.
//  3. Add an entry to agents.config.json:
//        { "id": "my-agent", "adapter": "my-agent", "name": "My Agent" }
//  4. Restart the server. The agent gets its own card on Mission Control plus
//     Chat, Workspace and Control Room tabs, with no frontend changes.
//
//  As written, this is a working demo agent: it "thinks", pretends to use a
//  tool that lists its workspace, and echoes your message back. To try it,
//  add  { "id": "echo", "adapter": "_template", "name": "Echo Bot" }  to the config.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import { BaseAgent } from './base.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default class TemplateAgent extends BaseAgent {
  // Shown on the agent's card and header. `color` tints its card.
  static meta = {
    type: 'echo',
    displayName: 'Echo Bot',
    description: 'A demo agent that shows the adapter pattern. Replace with your own logic.',
    icon: '◎',
    color: '#5eb8ff',
  };

  #cancelled = false;

  // Fields rendered in the Control Room. Types: text | textarea | number | select | toggle.
  // Values are saved automatically and available as this.settings[key].
  settingsSchema() {
    return [
      { key: 'prefix', label: 'Reply prefix', type: 'text', default: 'You said:' },
      { key: 'delayMs', label: 'Typing delay (ms)', type: 'number', default: 25 },
    ];
  }

  // Called at startup, every minute, and from the Control Room's "Run health check".
  // Return { online: false, detail } when the agent can't be reached
  // (CLI missing, API key not set, server down…).
  async healthCheck() {
    return { online: true, version: 'demo', detail: 'Demo agent is always online' };
  }

  // Do the work for one chat message. Report progress through `run`:
  //   run.activity(text)                     → live "what it's doing" line
  //   run.text(delta)                        → stream reply text into the chat
  //   run.tool({ id, name, input, label })   → show a tool call; returns its id
  //   run.toolResult(id, { output, isError })
  //   run.usage({ inputTokens, outputTokens, costUsd })
  //   run.touched(path, 'read' | 'edit')     → highlight a file in the Workspace
  //   run.log(level, text, raw?)             → Control Room console
  // Resolve when done; throw to mark the run as failed.
  // `this.session` is a persisted object for things like a conversation id.
  async execute(prompt, run) {
    this.#cancelled = false;
    run.activity('Thinking…');
    await sleep(400);

    const toolId = run.tool({ name: 'ListWorkspace', input: { path: '.' }, label: 'Looking around the workspace' });
    const files = await fs.readdir(this.workspaceRoot).catch(() => []);
    await sleep(300);
    run.toolResult(toolId, { output: files.join('\n') || '(empty)' });

    run.activity('Writing a reply…');
    const reply = `${this.settings.prefix} "${prompt}"\n\nMy workspace has **${files.length}** item(s).`;
    for (const ch of reply) {
      if (this.#cancelled) throw new Error('stopped');
      run.text(ch);
      await sleep(Number(this.settings.delayMs) || 0);
    }
    run.usage({ inputTokens: prompt.length, outputTokens: reply.length, costUsd: 0 });
  }

  // Called when the operator presses Stop.
  stop() { this.#cancelled = true; }
}
