#!/usr/bin/env node
const { exec } = require('child_process');
const chokidar = require('chokidar');

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

let timer = null;
const DEBOUNCE_MS = 2000;

async function doCommitAndPush() {
  try {
    console.log('[auto-push] Staging changes...');
    await run('git add -A');
    const status = (await run('git status --porcelain')).stdout.trim();
    if (!status) {
      console.log('[auto-push] No changes to commit.');
      return;
    }

    const date = new Date().toISOString();
    const branchRes = await run('git rev-parse --abbrev-ref HEAD');
    const branch = branchRes.stdout.trim();
    const message = `chore(auto): auto-save ${date} (${branch})`;

    console.log('[auto-push] Committing...');
    await run(`git commit -m "${message}"`);
    console.log('[auto-push] Pushing...');
    await run('git push');
    console.log('[auto-push] Push complete.');
  } catch (e) {
    console.error('[auto-push] Error during commit/push:', e.err ? e.err.message : e);
  }
}

const watcher = chokidar.watch(['src', 'public', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'bun.lockb'], {
  ignored: /node_modules|\.git/,
  persistent: true,
  ignoreInitial: true,
});

watcher.on('all', (event, path) => {
  console.log(`[auto-push] Detected ${event} on ${path}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(doCommitAndPush, DEBOUNCE_MS);
});

console.log('[auto-push] Watching for changes. Press Ctrl+C to exit.');
