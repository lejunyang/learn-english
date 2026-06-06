#!/usr/bin/env node
/* eslint-disable no-console */
// 干掉占用 5173 (web) / 5174 (server) 的进程。跨平台。
import { execSync } from 'node:child_process';
import os from 'node:os';

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const targets = ports.length ? ports : [5173, 5174];
const isWin = os.platform() === 'win32';

function pidsOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/LISTENING\s+(\d+)/);
        if (m) pids.add(m[1]);
      }
      return [...pids];
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
      return out.split(/\s+/).filter(Boolean);
    }
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (isWin) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let killed = 0;
for (const port of targets) {
  const pids = pidsOnPort(port);
  if (!pids.length) {
    console.log(`[kill-ports] :${port} idle`);
    continue;
  }
  for (const pid of pids) {
    const ok = killPid(pid);
    console.log(`[kill-ports] :${port} pid=${pid} ${ok ? 'killed' : 'FAILED'}`);
    if (ok) killed++;
  }
}
console.log(`[kill-ports] done, killed ${killed} process(es)`);
