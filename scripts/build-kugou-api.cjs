#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const apiCandidates = [
  path.resolve(projectDir, 'KuGouMusicApi'),
  path.resolve(projectDir, '..', 'KuGouMusicApi'),
  path.resolve(projectDir, '..', '..', 'KuGouMusicApi'),
].filter((candidate, index, array) => array.indexOf(candidate) === index);
const apiRoot = apiCandidates.find((candidate) => fs.existsSync(candidate)) || apiCandidates[0];
const outRoot = path.join(apiRoot, 'bin', 'api_js');
const esbuild = require(require.resolve('esbuild', { paths: [apiRoot] }));

function runEsbuild(options) {
  esbuild.buildSync({
    absWorkingDir: apiRoot,
    bundle: true,
    minify: true,
    platform: 'node',
    logLevel: 'info',
    ...options,
  });
}

function buildDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js'));
  if (files.length === 0) {
    return;
  }

  const entryPoints = files.map((file) => path.join(sourceDir, file));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(targetDir, file)), { recursive: true });
  }

  runEsbuild({
    entryPoints,
    outdir: targetDir,
  });
}

fs.mkdirSync(path.join(outRoot, 'util'), { recursive: true });
fs.mkdirSync(path.join(outRoot, 'module'), { recursive: true });

runEsbuild({
  entryPoints: [path.join(apiRoot, 'index.js')],
  outfile: path.join(outRoot, 'app.js'),
});

runEsbuild({
  entryPoints: [path.join(apiRoot, 'main.js')],
  outfile: path.join(outRoot, 'main.js'),
});

buildDirectory(path.join(apiRoot, 'util'), path.join(outRoot, 'util'));
buildDirectory(path.join(apiRoot, 'module'), path.join(outRoot, 'module'));

console.log('[build-kugou-api] KuGouMusicApi JS bundle completed');
