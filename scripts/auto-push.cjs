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

function humanizeFileName(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  if (!base) return filePath;
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim();
}

function buildCommitMessage(statusOutput) {
  const lines = statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const changedFiles = lines.map((line) => {
    const statusCode = line.slice(0, 2).trim() || 'M';
    const rawPath = line.slice(3).trim();
    const finalPath = rawPath.includes('->')
      ? rawPath.split('->').pop().trim()
      : rawPath;
    return { statusCode, filePath: finalPath };
  });

  const primary = changedFiles[0];
  const primaryName = humanizeFileName(primary.filePath);
  const extraCount = changedFiles.length - 1;

  if (changedFiles.length === 1) {
    if (primary.statusCode.includes('A')) return `Add ${primaryName}`;
    if (primary.statusCode.includes('D')) return `Remove ${primaryName}`;
    if (primary.statusCode.includes('R')) return `Rename ${primaryName}`;
    return `Update ${primaryName}`;
  }

  return `Update ${primaryName}${extraCount === 1 ? ' and 1 more file' : ` and ${extraCount} more files`}`;
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

    const message = buildCommitMessage(status);

    console.log(`[auto-push] Committing with message: ${message}`);
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
