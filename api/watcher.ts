//@ts-ignore
import chokidar from 'chokidar';
import fs from 'fs/promises';
import { existsSync, Stats } from 'fs';
import path from 'path';
import readline from 'readline';

// --- Configuration ---
const MAX_WATCH_SIZE_MB = 1;
const BYTES_PER_MB = 1024 * 1024;

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/*.log',
  '**/.DS_Store',
  '**/Thumbs.db',
];

interface FileEntry {
  path: string; // Relative path
  size: number;
  content: string;
}

// Global state
const fileRegistry = new Map<string, FileEntry>();
let watchPath = '';

/**
 * Filter: Ignores specific patterns AND files exceeding the size limit
 */
const shouldIgnore = (itemPath: string, stats?: Stats) => {
  // 1. Check folder/file patterns
  const isPatternIgnored = IGNORED_PATTERNS.some((pattern) => {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
    return regex.test(itemPath);
  });
  if (isPatternIgnored) return true;

  // 2. Check size limit for watched files
  if (stats && stats.isFile()) {
    return stats.size > MAX_WATCH_SIZE_MB * BYTES_PER_MB;
  }
  return false;
};

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function startApp() {
  // 1. Get path from Argument or User Input
  let targetDir = process.argv[2];
  if (!targetDir) {
    targetDir = await askQuestion('Please enter the folder path to watch: ');
  }

  watchPath = path.resolve(targetDir);
  if (!existsSync(watchPath)) {
    console.error(`Error: Path "${watchPath}" does not exist.`);
    process.exit(1);
  }

  const outputFile = `${watchPath}-extra.json`;

  // 2. Debounced Write Logic
  let debounceTimer: NodeJS.Timeout | null = null;
  const syncToDisk = async () => {
    try {
      const outputData = {
        dir: watchPath,
        files: Array.from(fileRegistry.values()),
      };
      await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2));
      console.log(`[${new Date().toLocaleTimeString()}] Manifest Synced: ${outputFile}`);
    } catch (err) {
      console.error('Failed to write output JSON:', err);
    }
  };

  const requestSync = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(syncToDisk, 500);
  };

  // 3. File Processing Logic
  const handleUpdate = async (fullPath: string, stats: Stats | undefined) => {
    // Skip the output file itself to avoid infinite loops
    if (fullPath === outputFile) return;
    if (!stats || stats.isDirectory()) return;

    try {
      const relativePath = path.relative(watchPath, fullPath);
      const content = await fs.readFile(fullPath, 'utf8');

      fileRegistry.set(fullPath, {
        path: relativePath,
        size: stats.size,
        content: content,
      });
      requestSync();
    } catch (e) {
      // Handles rapid deletions or permission locks
    }
  };

  // 4. Initialize Watcher
  console.log(`\n--- Watcher Started ---`);
  console.log(`Watching Dir: ${watchPath}`);
  console.log(`Size Limit:   Files > ${MAX_WATCH_SIZE_MB}MB will be ignored.`);
  console.log(`Output File:  ${outputFile}\n`);

  const watcher = chokidar.watch(watchPath, {
    ignored: shouldIgnore,
    persistent: true,
    alwaysStat: true, // Crucial to get stats for the size limit check
    ignoreInitial: false,
  });

  watcher
    .on('add', (p, s) => handleUpdate(p, s))
    .on('change', (p, s) => handleUpdate(p, s))
    .on('unlink', (p) => {
      fileRegistry.delete(p);
      requestSync();
    })
    .on('error', (error) => console.error(`Watcher error: ${error}`));
}


startApp().catch(console.error);