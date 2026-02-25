#!/usr/bin/env node
/**
 * Install Git Hooks
 * 
 * Copies hook scripts from scripts/git-hooks/ to .git/hooks/
 * Run with: npm run hooks:install
 */

import { copyFileSync, chmodSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const hooksDir = join(__dirname, '..', '.git', 'hooks');
const sourceDir = join(__dirname, '..', 'scripts', 'git-hooks');

const hooks = ['pre-commit', 'pre-push'];

// Ensure hooks directory exists
if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

let installed = 0;
let skipped = 0;

for (const hook of hooks) {
  const source = join(sourceDir, hook);
  const target = join(hooksDir, hook);
  
  if (!existsSync(source)) {
    console.log(`⊘ Hook source not found: ${hook}`);
    skipped++;
    continue;
  }
  
  try {
    copyFileSync(source, target);
    chmodSync(target, 0o755);
    console.log(`✓ Installed: ${hook}`);
    installed++;
  } catch (err) {
    console.error(`✗ Failed to install ${hook}:`, err.message);
    skipped++;
  }
}

console.log(`\nHooks installed: ${installed}, skipped: ${skipped}`);

if (installed === 0) {
  console.log('\nNote: Git hooks are not tracked by git. To install:');
  console.log('  1. Run: npm run hooks:install');
  console.log('  2. Or manually copy scripts/git-hooks/* to .git/hooks/');
  process.exit(1);
}
