#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const OWNER = 'ldx123000';
const REPO = 'Hydrogen-Music';
const PKGBASE = 'hydrogen-music-bin';
const APP_NAME = 'hydrogen-music';
const UPSTREAM_URL = `https://github.com/${OWNER}/${REPO}`;
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}`;
const USER_AGENT = 'hydrogen-music-aur-publisher';
const PKG_DESCRIPTION = 'Arknights-style third-party NetEase Cloud Music player built with Electron and Vue 3';
const DEPENDENCIES = [
  'alsa-lib',
  'at-spi2-core',
  'fuse2',
  'glibc',
  'gtk3',
  'libnotify',
  'libsecret',
  'libxss',
  'libxtst',
  'nss',
  'util-linux-libs',
  'xdg-utils',
];

function parseArgs(argv) {
  const options = {
    tag: '',
    outDir: path.join(process.cwd(), '_aur-package'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out') {
      const output = argv[index + 1];
      if (!output) throw new Error('--out requires a directory');
      options.outDir = path.resolve(output);
      index += 1;
    } else if (!argument.startsWith('-') && !options.tag) {
      options.tag = argument.startsWith('v') ? argument : `v${argument}`;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.tag) {
    throw new Error('Usage: node scripts/update-aur-package.cjs <release-tag> [--out DIR]');
  }

  const version = options.tag.slice(1);
  if (!/^[0-9][0-9A-Za-z._+]*$/.test(version)) {
    throw new Error(`Release tag ${options.tag} cannot be represented as an AUR pkgver`);
  }

  return { ...options, version };
}

function requestStream(url, headers = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Too many redirects for ${url}`));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, response => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error(`Redirect without a location for ${url}`));
          return;
        }

        const redirectUrl = new URL(location, url).toString();
        const redirectHeaders = { ...headers };
        if (new URL(redirectUrl).origin !== new URL(url).origin) {
          delete redirectHeaders.Authorization;
        }
        resolve(requestStream(redirectUrl, redirectHeaders, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Request failed with HTTP ${statusCode}: ${url}`));
        return;
      }

      resolve(response);
    });

    request.setTimeout(60_000, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
    request.on('error', error => {
      reject(new Error(`${error.message}: ${url}`));
    });
  });
}

async function requestJson(url, headers) {
  const response = await requestStream(url, headers);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function fetchRelease(tag) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  return requestJson(`${API_URL}/releases/tags/${encodeURIComponent(tag)}`, headers);
}

async function sha256FromUrl(url) {
  const response = await requestStream(url, { 'User-Agent': USER_AGENT });
  const hash = crypto.createHash('sha256');
  for await (const chunk of response) hash.update(chunk);
  return hash.digest('hex');
}

async function sha256FromReleaseAsset(asset) {
  const digest = typeof asset.digest === 'string' ? asset.digest : '';
  if (/^sha256:[0-9a-f]{64}$/i.test(digest)) {
    return digest.slice('sha256:'.length).toLowerCase();
  }

  return sha256FromUrl(asset.browser_download_url);
}

function shellArray(values) {
  return values.map(value => `'${value}'`).join(' ');
}

function buildPkgbuild(version, sums) {
  return `# SPDX-License-Identifier: 0BSD
# Maintainer: ldx123000 <ldx123000@gmail.com>

pkgname=${PKGBASE}
_pkgname=${APP_NAME}
pkgver=${version}
pkgrel=1
pkgdesc='${PKG_DESCRIPTION}'
arch=('x86_64')
url='${UPSTREAM_URL}'
license=('MIT')
depends=(${shellArray(DEPENDENCIES)})
optdepends=('libappindicator: system tray support')
provides=('hydrogen-music')
conflicts=('hydrogen-music')
options=('!strip')
source=(
  "\${_pkgname}-\${pkgver}.AppImage::\${url}/releases/download/v\${pkgver}/Hydrogen.Music-\${pkgver}.AppImage"
  "\${_pkgname}.png::${RAW_URL}/v\${pkgver}/img/icon.png"
  "\${_pkgname}-LICENSE::${RAW_URL}/v\${pkgver}/LICENSE"
)
noextract=("\${_pkgname}-\${pkgver}.AppImage")
sha256sums=(
  '${sums.appimage}'
  '${sums.icon}'
  '${sums.license}'
)

package() {
  install -Dm755 "\${srcdir}/\${_pkgname}-\${pkgver}.AppImage" "\${pkgdir}/opt/\${_pkgname}/\${_pkgname}.AppImage"
  install -Dm644 "\${srcdir}/\${_pkgname}.png" "\${pkgdir}/usr/share/pixmaps/\${_pkgname}.png"
  install -Dm644 "\${srcdir}/\${_pkgname}-LICENSE" "\${pkgdir}/usr/share/licenses/\${pkgname}/LICENSE"

  install -Dm755 /dev/stdin "\${pkgdir}/usr/bin/\${_pkgname}" <<'EOF'
#!/bin/sh
exec /opt/hydrogen-music/hydrogen-music.AppImage "$@"
EOF

  install -Dm644 /dev/stdin "\${pkgdir}/usr/share/applications/\${_pkgname}.desktop" <<EOF
[Desktop Entry]
Name=Hydrogen Music
Comment=Arknights-style third-party NetEase Cloud Music player
Exec=/usr/bin/\${_pkgname} %U
Terminal=false
Type=Application
Icon=\${_pkgname}
StartupWMClass=Hydrogen Music
Categories=Audio;Music;Player;
EOF
}
`;
}

function buildSrcinfo(version, sums) {
  const dependencies = DEPENDENCIES.map(dependency => `\tdepends = ${dependency}`).join('\n');

  return `pkgbase = ${PKGBASE}
\tpkgdesc = ${PKG_DESCRIPTION}
\tpkgver = ${version}
\tpkgrel = 1
\turl = ${UPSTREAM_URL}
\tarch = x86_64
\tlicense = MIT
${dependencies}
\toptdepends = libappindicator: system tray support
\tprovides = hydrogen-music
\tconflicts = hydrogen-music
\toptions = !strip
\tnoextract = ${APP_NAME}-${version}.AppImage
\tsource = ${APP_NAME}-${version}.AppImage::${UPSTREAM_URL}/releases/download/v${version}/Hydrogen.Music-${version}.AppImage
\tsource = ${APP_NAME}.png::${RAW_URL}/v${version}/img/icon.png
\tsource = ${APP_NAME}-LICENSE::${RAW_URL}/v${version}/LICENSE
\tsha256sums = ${sums.appimage}
\tsha256sums = ${sums.icon}
\tsha256sums = ${sums.license}

pkgname = ${PKGBASE}
`;
}

async function main() {
  const { tag, version, outDir } = parseArgs(process.argv.slice(2));
  const release = await fetchRelease(tag);

  if (release.tag_name !== tag) {
    throw new Error(`GitHub returned release ${release.tag_name || '<unknown>'} instead of ${tag}`);
  }
  if (release.draft) {
    throw new Error(`${tag} is still a draft release`);
  }
  if (release.prerelease) {
    throw new Error(`${tag} is a prerelease and will not replace the stable AUR package`);
  }

  const appimageName = `Hydrogen.Music-${version}.AppImage`;
  const appimageAsset = Array.isArray(release.assets)
    ? release.assets.find(asset => asset.name === appimageName && asset.state === 'uploaded')
    : null;
  if (!appimageAsset?.browser_download_url) {
    throw new Error(`Release ${tag} does not contain an uploaded ${appimageName}`);
  }

  const appimage = await sha256FromReleaseAsset(appimageAsset);
  const icon = await sha256FromUrl(`${RAW_URL}/${tag}/img/icon.png`);
  const license = await sha256FromUrl(`${RAW_URL}/${tag}/LICENSE`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'PKGBUILD'), buildPkgbuild(version, { appimage, icon, license }));
  fs.writeFileSync(path.join(outDir, '.SRCINFO'), buildSrcinfo(version, { appimage, icon, license }));

  console.log(`Generated ${PKGBASE} ${version} in ${outDir}`);
  console.log(`AppImage sha256: ${appimage}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
