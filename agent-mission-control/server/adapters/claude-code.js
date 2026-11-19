// Claude Code adapter — drives the local `claude` CLI in headless mode
// (`claude -p --output-format stream-json`) and translates its event stream
// into Mission Control chat parts, live activity, and usage stats.
//
// Each agent instance keeps a Claude session id so follow-up messages
// continue the same conversation (`--resume <id>`).

import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { BaseAgent, summarize } from './base.js';

const IS_WIN = process.platform === 'win32';

export default class ClaudeCodeAgent extends BaseAgent {
  static meta = {
    type: 'claude-code',
    displayName: 'Claude Code',
    description: "Anthropic's agentic coding assistant, running locally through the claude CLI.",
    icon: '✳',
    color: '#d97757',
  };

  #child = null;

  settingsSchema() {
    return [
      { key: 'binary', label: 'CLI command', type: 'text', default: 'claude', help: 'Path to the claude executable, if it is not on your PATH.' },
      { key: 'model', label: 'Model', type: 'text', default: '', placeholder: 'CLI default', help: 'An alias such as "opus" or "sonnet", or a full model id. Leave blank for your CLI default.' },
      {
        key: 'permissionMode', label: 'Permission mode', type: 'select', default: 'acceptEdits',
        options: [
          { value: '', label: 'CLI default' },
          { value: 'acceptEdits', label: 'Accept edits — may change files in the workspace' },
          { value: 'plan', label: 'Plan — read-only, proposes a plan' },
          { value: 'auto', label: 'Auto — the CLI decides what is safe' },
          { value: 'bypassPermissions', label: 'Bypass — every tool allowed (use with care)' },
        ],
        help: 'Headless runs cannot ask you for approval, so tools the mode does not allow get denied.',
      },
      { key: 'allowedTools', label: 'Extra allowed tools', type: 'text', default: '', placeholder: 'e.g. Bash(npm test) Bash(git status)', help: 'Space-separated tool rules passed to --allowedTools.' },
      { key: 'appendSystemPrompt', label: 'Standing instructions', type: 'textarea', default: '', placeholder: 'Added to the system prompt on every run.' },
      { key: 'extraArgs', label: 'Extra CLI flags', type: 'text', default: '', placeholder: 'e.g. --add-dir ../shared', help: 'Advanced: extra flags appended to the command line.' },
    ];
  }

  async healthCheck() {
    const bin = this.settings.binary || 'claude';
    return new Promise((resolve) => {
      execFile(bin, ['--version'], { timeout: 15000, shell: IS_WIN, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          const missing = err.code === 'ENOENT' || /not found|not recognized/i.test(stderr || '');
          resolve({
            online: false,
            detail: missing ? `"${bin}" was not found. Install Claude Code (npm i -g @anthropic-ai/claude-code) or set the CLI command in the Control Room.` : (stderr || err.message).trim(),
          });
          return;
        }
        resolve({ online: true, version: stdout.trim(), detail: `CLI ready · ${stdout.trim()}` });
      });
    });
  }

  resetSession() { this.session = {}; }

  stop() {
    const c = this.#child;
    if (!c) return;
    this.log('warn', 'Stop requested — terminating claude process');
    try {
      if (IS_WIN) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']);
      else c.kill('SIGINT');
    } catch { /* already gone */ }
    setTimeout(() => { if (this.#child === c) try { c.kill('SIGKILL'); } catch { /* gone */ } }, 4000);
  }

  buildArgs() {
    const s = this.settings;
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (s.model) args.push('--model', s.model);
    if (s.permissionMode) args.push('--permission-mode', s.permissionMode);
    if (s.allowedTools?.trim()) args.push('--allowedTools', ...s.allowedTools.trim().split(/\s+(?![^()]*\))/));
    if (s.appendSystemPrompt?.trim()) args.push('--append-system-prompt', s.appendSystemPrompt.trim());
    if (this.session.sessionId) args.push('--resume', this.session.sessionId);
    if (s.extraArgs?.trim()) args.push(...splitArgs(s.extraArgs));
    return args;
  }

  execute(prompt, run) {
    return new Promise((resolve, reject) => {
      const bin = this.settings.binary || 'claude';
      const args = this.buildArgs();
      run.log('info', `$ ${bin} ${args.map(quoteForLog).join(' ')}`);
      run.meta({ cwd: this.workspaceRoot });

      const child = spawn(IS_WIN ? quoteWin(bin) : bin, IS_WIN ? args.map(quoteWin) : args, {
        cwd: this.workspaceRoot,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-cli' },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: IS_WIN,
        windowsHide: true,
      });
      this.#child = child;
      run.meta({ pid: child.pid });
      child.stdin.end(prompt);

      const deltaMessages = new Set(); // assistant message ids whose text arrived as deltas
      const toolBlocks = new Map(); // stream index → tool name (for early activity)
      let result = null;
      let stderr = '';
      let buf = '';

      const handle = (ev) => {
        switch (ev.type) {
          case 'system':
            if (ev.subtype === 'init') {
              this.session.sessionId = ev.session_id;
              this.session.model = ev.model;
              run.meta({ sessionId: ev.session_id, model: ev.model });
              run.log('info', `Session ${ev.session_id} · model ${ev.model || 'default'} · ${ev.tools?.length || 0} tools`);
            } else if (ev.subtype === 'task_summary' && ev.detail) {
              run.activity(ev.detail);
            } else if (ev.subtype === 'status' && ev.status === 'requesting') {
              if (!toolBlocks.size) run.activity('Thinking…');
            }
            break;

          case 'stream_event': {
            if (ev.parent_tool_use_id) break; // subagent chatter: keep the main transcript clean
            const e = ev.event || {};
            if (e.type === 'message_start' && e.message?.id) toolBlocks.clear();
            if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
              toolBlocks.set(e.index, e.content_block.name);
              run.activity(`Preparing ${e.content_block.name}…`);
            }
            if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
              if (ev.api_message_id) deltaMessages.add(ev.api_message_id);
              if (!run.reply.parts.length || run.reply.parts.at(-1).type !== 'text') run.activity('Writing a reply…');
              run.text(e.delta.text);
            }
            break;
          }

          case 'assistant': {
            if (ev.parent_tool_use_id) break;
            const msg = ev.message || {};
            for (const block of msg.content || []) {
              if (block.type === 'text' && !deltaMessages.has(msg.id)) run.text(block.text);
              if (block.type === 'tool_use') {
                run.tool({ id: block.id, name: block.name, input: block.input, label: describeTool(block.name, block.input) });
                const fp = block.input?.file_path || block.input?.notebook_path || block.input?.path;
                if (fp && typeof fp === 'string') {
                  const abs = path.isAbsolute(fp) ? fp : path.join(this.workspaceRoot, fp);
                  run.touched(abs, /Read|Grep|Glob/.test(block.name) ? 'read' : 'edit');
                }
              }
            }
            break;
          }

          case 'user': {
            for (const block of ev.message?.content || []) {
              if (block.type === 'tool_result') {
                const out = Array.isArray(block.content)
                  ? block.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')
                  : block.content;
                run.toolResult(block.tool_use_id, { output: out, isError: !!block.is_error });
              }
            }
            run.activity('Thinking…');
            break;
          }

          case 'result':
            result = ev;
            break;

          default:
            if (ev.total_cost_usd !== undefined && ev.duration_api_ms !== undefined) result = ev;
        }
      };

      child.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { run.log('out', line); continue; }
          if (ev.type !== 'stream_event') run.log('event', `${ev.type}${ev.subtype ? ':' + ev.subtype : ''}`, ev);
          try { handle(ev); } catch (err) { run.log('error', `Failed to handle event: ${err.message}`); }
        }
      });

      child.stderr.on('data', (chunk) => {
        const s = chunk.toString('utf8');
        stderr += s;
        run.log('stderr', s.trim());
      });

      child.on('error', (err) => {
        this.#child = null;
        reject(new Error(err.code === 'ENOENT' ? `Could not start "${bin}". Is Claude Code installed?` : err.message));
      });

      child.on('close', (code, signal) => {
        this.#child = null;
        run.log('info', `claude exited (code ${code ?? '—'}${signal ? ', ' + signal : ''})`);
        if (result) {
          if (result.session_id) this.session.sessionId = result.session_id;
          const u = result.usage || {};
          run.usage({
            inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
            outputTokens: u.output_tokens || 0,
            costUsd: result.total_cost_usd || 0,
          });
          run.meta({ durationMs: result.duration_ms, turns: result.num_turns });
          const denied = result.permission_denials || [];
          if (denied.length) {
            run.meta({ deniedTools: [...new Set(denied.map((d) => d.tool_name))] });
            run.log('warn', `${denied.length} tool call(s) blocked by permission mode "${this.settings.permissionMode || 'default'}"`);
          }
          if (!run.reply.parts.some((p) => p.type === 'text') && typeof result.result === 'string' && result.result) run.text(result.result);
          if (result.is_error || (result.subtype && result.subtype !== 'success')) {
            return reject(new Error(typeof result.result === 'string' && result.result ? result.result : `Run ended: ${result.subtype || 'error'}`));
          }
          this.save();
          return resolve();
        }
        if (run.reply.status === 'stopped') return reject(new Error('stopped'));
        reject(new Error(summarize(stderr, 400) || `claude exited with code ${code}`));
      });
    });
  }
}

// Human-friendly one-liners for the live activity ticker.
export function describeTool(name, input = {}) {
  const base = (p) => (p ? String(p).split(/[\\/]/).pop() : '');
  switch (name) {
    case 'Read': return `Reading ${base(input.file_path)}`;
    case 'Write': return `Writing ${base(input.file_path)}`;
    case 'Edit': case 'MultiEdit': return `Editing ${base(input.file_path)}`;
    case 'NotebookEdit': return `Editing notebook ${base(input.notebook_path)}`;
    case 'Bash': return `Running: ${summarize(input.description || input.command, 70)}`;
    case 'Grep': return `Searching for "${summarize(input.pattern, 40)}"`;
    case 'Glob': return `Finding files ${summarize(input.pattern, 40)}`;
    case 'WebFetch': return `Fetching ${summarize(input.url, 60)}`;
    case 'WebSearch': return `Searching the web: ${summarize(input.query, 50)}`;
    case 'Task': case 'Agent': return `Delegating: ${summarize(input.description || input.prompt, 60)}`;
    case 'TodoWrite': return 'Updating its task list';
    default: return `Using ${name}`;
  }
}

function splitArgs(s) {
  const out = [];
  s.replace(/"([^"]*)"|'([^']*)'|(\S+)/g, (_, a, b, c) => { out.push(a ?? b ?? c); return ''; });
  return out;
}
function quoteForLog(a) { return /[\s"'()]/.test(a) ? JSON.stringify(a.length > 80 ? a.slice(0, 77) + '…' : a) : a; }
function quoteWin(a) { return /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a; }
