#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const githubApiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const defaultWorkflow = 'build-mpv-audio-only.yml';
const defaultArtifact = 'mpv-audio-only-all-platforms';
const platforms = ['win32-x64', 'darwin-arm64', 'linux-x64'];
const artifactByPlatform = Object.freeze({
  'win32-x64': 'mpv-audio-only-win32-x64',
  'darwin-arm64': 'mpv-audio-only-darwin-arm64',
  'linux-x64': 'mpv-audio-only-linux-x64',
});

function parseArgs(argv) {
  const options = {
    workflow: defaultWorkflow,
    artifact: '',
    platform: 'current',
    runId: '',
    repo: '',
    clean: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || '';

    if (arg === '--workflow') options.workflow = next();
    else if (arg === '--artifact') options.artifact = next();
    else if (arg === '--platform') options.platform = next();
    else if (arg === '--current') options.platform = 'current';
    else if (arg === '--run-id') options.runId = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--keep-existing') options.clean = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.platform = resolveRequestedPlatform(options.platform);
  options.artifact = options.artifact || resolveArtifactName(options.platform);
  return options;
}

function printHelp() {
  console.log(`Download the latest audio-only MPV GitHub Actions artifact.

Usage:
  node scripts/mpv-audio-only/download-artifacts.cjs
  node scripts/mpv-audio-only/download-artifacts.cjs --platform all
  node scripts/mpv-audio-only/download-artifacts.cjs --platform win32-x64
  node scripts/mpv-audio-only/download-artifacts.cjs --run-id 123456789

Options:
  --repo owner/name        GitHub repository. Defaults to the current git repo.
  --workflow file.yml      Workflow file. Defaults to ${defaultWorkflow}.
  --artifact name          Artifact name. Defaults to ${defaultArtifact}, or the selected platform artifact.
  --platform platform      current, all, win32-x64, darwin-arm64, or linux-x64. Defaults to current.
  --current                Shortcut for --platform current.
  --run-id id              Download a specific workflow run.
  --keep-existing          Copy over existing resources/mpv directories instead of replacing them.

Authentication:
  GitHub requires authentication when downloading Actions artifact zip files.
  Set GH_TOKEN or GITHUB_TOKEN to a token with Actions read permission.
`);
}

function resolveCurrentPlatform() {
  const arch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : '';
  const platform = arch ? `${process.platform}-${arch}` : process.platform;
  if (platforms.includes(platform)) return platform;
  throw new Error(`Current platform is not supported by this workflow: ${process.platform}-${process.arch}`);
}

function resolveRequestedPlatform(value) {
  const platform = value || 'all';
  if (platform === 'all') return platform;
  if (platform === 'current') return resolveCurrentPlatform();
  if (platforms.includes(platform)) return platform;
  throw new Error(`Unsupported platform "${platform}". Use all, current, ${platforms.join(', ')}.`);
}

function resolveArtifactName(platform) {
  if (platform === 'all') return defaultArtifact;
  return artifactByPlatform[platform];
}

function tryRun(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error || result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function parseRepo(value) {
  const repo = String(value || '').trim();
  if (!repo) return '';

  const match = repo.match(/github\.com[:/]([^/\s]+\/[^/\s?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i);
  if (match) return match[1];

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(repo)) {
    return repo.replace(/\.git$/, '');
  }

  return '';
}

function resolveRepo(explicitRepo) {
  const explicit = parseRepo(explicitRepo);
  if (explicit) return explicit;

  const envRepo = parseRepo(process.env.GITHUB_REPOSITORY);
  if (envRepo) return envRepo;

  const origin = tryRun('git', ['config', '--get', 'remote.origin.url']);
  const gitRepo = parseRepo(origin);
  if (gitRepo) return gitRepo;

  throw new Error('Cannot infer GitHub repository. Pass --repo owner/name.');
}

function githubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

function githubApiUrl(repo, apiPath) {
  const base = githubApiBase.replace(/\/+$/, '');
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  return `${base}/repos/${encodedRepo}${apiPath}`;
}

function requestHeaders(urlString) {
  const headers = {
    'User-Agent': 'hydrogen-music-mpv-downloader',
  };

  const apiHost = new URL(githubApiBase).hostname;
  const targetHost = new URL(urlString).hostname;
  if (targetHost === apiHost) {
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    const token = githubToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function formatHttpError(urlString, statusCode, body) {
  let details = body.toString('utf8').trim();
  try {
    const json = JSON.parse(details);
    details = json.message || details;
  } catch (error) {
    // Keep the original response body.
  }

  const authHint = statusCode === 401 || statusCode === 403
    ? '\nGitHub requires authentication to download Actions artifact zip files, even when artifact metadata is visible. Set GH_TOKEN or GITHUB_TOKEN to a token with Actions read permission.'
    : '';
  return `GitHub request failed (${statusCode}) for ${urlString}${details ? `: ${details}` : ''}${authHint}`;
}

function requestBuffer(urlString, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'http:' ? http : https;
    const request = client.request(url, { headers: requestHeaders(urlString) }, response => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        if (redirectCount >= 8) {
          reject(new Error(`Too many redirects while requesting ${urlString}`));
          return;
        }
        resolve(requestBuffer(new URL(location, url).toString(), redirectCount + 1));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        if (status >= 200 && status < 300) {
          resolve(body);
        } else {
          reject(new Error(formatHttpError(urlString, status, body)));
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function requestJson(urlString) {
  const body = await requestBuffer(urlString);
  return JSON.parse(body.toString('utf8'));
}

function downloadFile(urlString, targetPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'http:' ? http : https;
    const request = client.request(url, { headers: requestHeaders(urlString) }, response => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        if (redirectCount >= 8) {
          reject(new Error(`Too many redirects while downloading ${urlString}`));
          return;
        }
        resolve(downloadFile(new URL(location, url).toString(), targetPath, redirectCount + 1));
        return;
      }

      if (status < 200 || status >= 300) {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          reject(new Error(formatHttpError(urlString, status, Buffer.concat(chunks))));
        });
        return;
      }

      const file = fs.createWriteStream(targetPath);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', error => {
        fs.rmSync(targetPath, { force: true });
        reject(error);
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function resolveRunId(options) {
  if (options.runId) return options.runId;

  const url = githubApiUrl(
    options.repo,
    `/actions/workflows/${encodeURIComponent(options.workflow)}/runs?status=success&per_page=1`,
  );
  const data = await requestJson(url);
  const runId = data.workflow_runs && data.workflow_runs[0] && data.workflow_runs[0].id;

  if (!runId) {
    throw new Error(`No successful ${options.workflow} run was found. Run the workflow on GitHub Actions first.`);
  }

  return String(runId);
}

async function downloadArtifactZip(repo, runId, artifactName, targetPath) {
  const url = githubApiUrl(repo, `/actions/runs/${encodeURIComponent(runId)}/artifacts?per_page=100`);
  const data = await requestJson(url);
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  const artifact = artifacts.find(item => item.name === artifactName);

  if (!artifact) {
    const names = artifacts.map(item => item.name).join(', ') || 'none';
    throw new Error(`Artifact "${artifactName}" was not found in run ${runId}. Available artifacts: ${names}`);
  }

  if (artifact.expired) {
    throw new Error(`Artifact "${artifactName}" in run ${runId} has expired. Re-run the workflow first.`);
  }

  await downloadFile(artifact.archive_download_url, targetPath);
}

function shellQuoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  const attempts = process.platform === 'win32'
    ? [
        ['pwsh', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${shellQuoteForPowerShell(zipPath)} -DestinationPath ${shellQuoteForPowerShell(targetDir)} -Force`]],
        ['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${shellQuoteForPowerShell(zipPath)} -DestinationPath ${shellQuoteForPowerShell(targetDir)} -Force`]],
        ['tar', ['-xf', zipPath, '-C', targetDir]],
      ]
    : [
        ['unzip', ['-q', zipPath, '-d', targetDir]],
        ['python3', ['-m', 'zipfile', '-e', zipPath, targetDir]],
        ['python', ['-m', 'zipfile', '-e', zipPath, targetDir]],
        ['tar', ['-xf', zipPath, '-C', targetDir]],
      ];

  const errors = [];
  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (!result.error && result.status === 0) return;
    const message = result.error
      ? result.error.message
      : String(result.stderr || result.stdout || '').trim();
    errors.push(`${command}: ${message || `exit ${result.status}`}`);
  }

  throw new Error(`Failed to extract artifact zip.\n${errors.join('\n')}`);
}

function isInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function findSourceRoot(downloadDir, selectedPlatforms) {
  const candidates = [
    path.join(downloadDir, 'resources', 'mpv'),
    path.join(downloadDir, 'mpv'),
    downloadDir,
  ];

  return candidates.find(candidate => selectedPlatforms.every(platform => fs.existsSync(path.join(candidate, platform)))) || '';
}

function hasAnyFile(directoryPath) {
  if (!fs.existsSync(directoryPath)) return false;

  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) return true;
    }
  }

  return false;
}

function findPlatformSourceDir(downloadDir, platform, platformMode) {
  const candidates = [
    path.join(downloadDir, 'resources', 'mpv', platform),
    path.join(downloadDir, 'mpv', platform),
    path.join(downloadDir, platform),
  ];

  const platformDirectory = candidates.find(candidate => hasAnyFile(candidate));
  if (platformDirectory) return platformDirectory;
  if (platformMode !== 'all' && hasAnyFile(downloadDir)) return downloadDir;
  return '';
}

function copyDirectory(sourceDir, targetDir, clean) {
  const resourceRoot = path.join(repoRoot, 'resources', 'mpv');
  if (!isInside(resourceRoot, targetDir)) {
    throw new Error(`Refusing to write outside resources/mpv: ${targetDir}`);
  }

  if (clean) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function listFiles(directoryPath) {
  const files = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files.sort();
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.repo = resolveRepo(options.repo);
  const runId = await resolveRunId(options);
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydrogen-mpv-artifacts-'));
  const extractDir = path.join(downloadDir, 'artifact');
  const artifactZip = path.join(downloadDir, `${options.artifact}.zip`);
  const selectedPlatforms = options.platform === 'all' ? platforms : [options.platform];

  try {
    console.log(`Downloading ${options.artifact} from ${options.repo} run ${runId}...`);
    await downloadArtifactZip(options.repo, runId, options.artifact, artifactZip);
    extractZip(artifactZip, extractDir);

    const sourceRoot = options.platform === 'all' ? findSourceRoot(extractDir, selectedPlatforms) : '';
    if (options.platform === 'all' && !sourceRoot) {
      throw new Error(`Downloaded artifact, but no resources/mpv platform directories were found: ${extractDir}`);
    }

    for (const platform of selectedPlatforms) {
      const sourceDir = options.platform === 'all'
        ? path.join(sourceRoot, platform)
        : findPlatformSourceDir(extractDir, platform, options.platform);
      if (!sourceDir || !fs.existsSync(sourceDir)) {
        throw new Error(`Artifact is missing ${platform}`);
      }

      const targetDir = path.join(repoRoot, 'resources', 'mpv', platform);
      copyDirectory(sourceDir, targetDir, options.clean);
    }
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }

  console.log('Updated MPV resources:');
  for (const platform of selectedPlatforms) {
    const targetDir = path.join(repoRoot, 'resources', 'mpv', platform);
    for (const filePath of listFiles(targetDir)) {
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      console.log(`- ${relativePath} (${formatBytes(fs.statSync(filePath).size)})`);
    }
  }
}

try {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
