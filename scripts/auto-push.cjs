#!/usr/bin/env node
const { exec } = require('child_process');
const path = require('path');
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
const WATCH_PATHS = [
  'src',
  'public',
  'scripts',
  'supabase',
  'package.json',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'index.html',
  '.env',
  '.env.example',
];
const IGNORED_PATTERNS = [
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  /(^|[\\/])\.vercel([\\/]|$)/,
  /(^|[\\/])android([\\/])app([\\/])build([\\/]|$)/,
  /\.log$/i,
  /(^|[\\/])supabase([\\/])\.temp([\\/]|$)/,
];

function shouldIgnore(filePath) {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
}

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

    try {
      await run('git push');
    } catch (pushError) {
      const combinedOutput = `${pushError.stdout || ''}\n${pushError.stderr || ''}`;
      if (combinedOutput.includes('fetch first') || combinedOutput.includes('non-fast-forward')) {
        console.log('[auto-push] Regular push rejected, retrying with --force-with-lease...');
        await run('git push --force-with-lease');
      } else {
        throw pushError;
      }
    }

    console.log('[auto-push] Push complete.');
  } catch (e) {
    console.error('[auto-push] Error during commit/push:', e.err ? e.err.message : e);
  }
}

const watcher = chokidar.watch(WATCH_PATHS, {
  ignored: shouldIgnore,
  persistent: true,
  ignoreInitial: true,
});

watcher.on('all', (event, filePath) => {
  const normalizedPath = filePath.split(path.sep).join('/');
  console.log(`[auto-push] Detected ${event} on ${normalizedPath}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(doCommitAndPush, DEBOUNCE_MS);
});

console.log('[auto-push] Watching for changes. Press Ctrl+C to exit.');
