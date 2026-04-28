import { spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = path.join(__dirname, '.sessions.json');

const CLAUDE_BIN = path.join(
  homedir(),
  'AppData', 'Roaming', 'npm', 'node_modules',
  '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'
);

// 每个 session key 一个队列，保证串行
const sessionQueues = new Map();

// 跟踪所有活跃子进程，用于退出时清理
const activeProcesses = new Set();

export function killAllProcesses() {
  for (const proc of activeProcesses) {
    try { proc.kill(); } catch {}
  }
  activeProcesses.clear();
}

function callClaude(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      timeout: 120000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeProcesses.add(proc);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      activeProcesses.delete(proc);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'))));
    }
  } catch {}
  return new Map();
}

function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)));
  } catch {}
}

// 会话管理器：session 持久化到文件，重启后不丢记忆
class SessionManager {
  constructor() {
    this.sessions = loadSessions();
  }

  async run(sessionName, message) {
    if (!this.sessions.has(sessionName)) {
      this.sessions.set(sessionName, { id: crypto.randomUUID(), initialized: false });
      saveSessions(this.sessions);
    }

    const session = this.sessions.get(sessionName);

    if (session.initialized) {
      return callClaude(['-p', message, '-r', session.id]);
    } else {
      const result = await callClaude(['-p', message, '--session-id', session.id]);
      session.initialized = true;
      saveSessions(this.sessions);
      return result;
    }
  }
}

const manager = new SessionManager();

export function runClaude(message, sessionName = 'shared') {
  if (!sessionQueues.has(sessionName)) {
    sessionQueues.set(sessionName, Promise.resolve());
  }

  const queue = sessionQueues.get(sessionName);

  const task = queue.then(() => manager.run(sessionName, message));

  // 错误不阻塞后续消息
  sessionQueues.set(sessionName, task.catch(() => {}));

  return task;
}
