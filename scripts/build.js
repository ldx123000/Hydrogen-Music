#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

function getPlatformFlag() {
  const p = process.platform;
  if (p === 'darwin') return '--mac';
  if (p === 'win32') return '--win';
  return '--linux';
}

// Resolve electron-builder CLI and invoke via Node to avoid using a shell.
function getElectronBuilderCli() {
  try {
    // electron-builder exposes CLI at out/cli/cli.js
    return require.resolve('electron-builder/out/cli/cli.js');
  } catch (e) {
    console.error('Cannot resolve electron-builder CLI. Is it installed?');
    process.exit(1);
  }
}

const extraArgs = process.argv.slice(2);
const args = [getPlatformFlag(), ...extraArgs];
const cli = getElectronBuilderCli();

// Spawn the Node executable with the CLI script, no shell used.
const result = spawnSync(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
