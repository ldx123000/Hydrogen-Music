const NODE_MODULE_PRUNE_DIRS = [
  'test',
  'tests',
  '__tests__',
  'example',
  'examples',
  'benchmark',
  'benchmarks',
  'docs',
  'doc',
];

const NODE_MODULE_PRUNE_FILE_PATTERNS = [
  'README',
  'README.*',
  'readme',
  'readme.*',
  'CHANGELOG',
  'CHANGELOG.*',
  'ChangeLog',
  'ChangeLog.*',
  'changelog',
  'changelog.*',
];

function detectRequestedTargets(argv) {
  const args = new Set(argv);
  return {
    mac: args.has('--mac') || args.has('-m'),
    win: args.has('--win') || args.has('--windows') || args.has('-w'),
    linux: args.has('--linux') || args.has('-l'),
  };
}

function shouldExcludeLinuxOnlyDependencies() {
  const requestedTargets = detectRequestedTargets(process.argv);
  if (requestedTargets.linux) return false;
  if (requestedTargets.mac || requestedTargets.win) return true;
  return process.platform !== 'linux';
}

const BASE_FILE_PATTERNS = [
  'background.js',
  'desktop-lyric.html',
  'index.html',
  'dist/**/*',
  'src/assets/icon/**/*',
  'src/electron/**/*',
  'src/shared/settingsDefaults.json',
  'src/shared/settingsSchema.cjs',
  '!**/.DS_Store',
  '!**/node_modules',
  '!release{,/**/*}',
  '!dist-ssr{,/**/*}',
  '!img{,/**/*}',
  '!src/assets/fonts{,/**/*}',
  '!**/node_modules/**/*.d.ts',
  '!**/node_modules/**/*.map',
  '!**/node_modules/@neteasecloudmusicapienhanced/api/public{,/**/*}',
  '!**/node_modules/@neteasecloudmusicapienhanced/api/data/deviceid.txt',
  '!**/node_modules/@neteasecloudmusicapienhanced/api/node_modules/xml2js/lib/xml2js.bc.js',
  ...NODE_MODULE_PRUNE_DIRS.flatMap((name) => [
    `!**/node_modules/**/${name}`,
    `!**/node_modules/**/${name}/**`,
  ]),
  ...NODE_MODULE_PRUNE_FILE_PATTERNS.map((pattern) => `!**/node_modules/**/${pattern}`),
];

const LINUX_ONLY_DEPENDENCY_EXCLUDES = [
  '!**/node_modules/dbus-next',
  '!**/node_modules/dbus-next/**/*',
  '!**/node_modules/mpris-service',
  '!**/node_modules/mpris-service/**/*',
];

const KEEP_NODE_MODULE_FILE = /(^|\/)(LICENSE(?:\.[^/]+)?|LICENCE(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?|THIRD-PARTY-NOTICES(?:\.[^/]+)?)$/i;

module.exports = {
  productName: 'Hydrogen Music',
  appId: 'com.hydrogenmusic.app',
  asar: true,
  compression: 'maximum',
  // Electron locale naming differs across platforms, so keep both macOS and Windows/Linux variants.
  electronLanguages: ['en', 'en-US', 'zh_CN', 'zh_TW', 'zh-CN', 'zh-TW'],
  asarUnpack: [
    '**/node_modules/ffmpeg-static/**',
  ],
  directories: {
    output: 'release/${version}',
  },
  files: [
    ...BASE_FILE_PATTERNS,
    ...(shouldExcludeLinuxOnlyDependencies() ? LINUX_ONLY_DEPENDENCY_EXCLUDES : []),
  ],
  onNodeModuleFile: (filePath) => {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return KEEP_NODE_MODULE_FILE.test(normalizedPath);
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'Hydrogen.Music.Setup.${version}.${ext}',
  },
  mac: {
    category: 'public.app-category.music',
    icon: './src/assets/icon/icon.icns',
    target: ['dmg'],
    artifactName: 'Hydrogen.Music-${version}-${arch}.${ext}',
  },
  win: {
    icon: './src/assets/icon/icon.ico',
    target: ['nsis', 'portable', 'zip'],
    verifyUpdateCodeSignature: false,
    artifactName: 'Hydrogen.Music.${version}.${ext}',
  },
  linux: {
    category: 'Audio',
    icon: './src/assets/icon/icon.png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
      {
        target: 'rpm',
        arch: ['x64'],
      },
    ],
    artifactName: 'Hydrogen.Music-${version}.${ext}',
  },
  publish: [
    {
      provider: 'github',
      owner: 'ldx123000',
      repo: 'Hydrogen-Music',
      releaseType: 'draft',
    },
  ],
};
