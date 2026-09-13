'use strict';
const signedMac = !!process.env.CSC_LINK;
module.exports = {
  appId: 'io.rixu', productName: '日序', executableName: 'rixu',
  asar: true,
  directories: { output: 'dist', buildResources: 'build' },
  files: ['src/**/*', 'package.json', '!src/assets/*.svg'],
  icon: 'src/assets/icon.png',
  artifactName: 'Rixu-${version}-${os}-${arch}.${ext}',
  publish: null,
  linux: {
    target: ['deb', 'tar.gz'], category: 'Office', executableName: 'rixu', syncDesktopName: true,
    icon: 'build/icons',
    maintainer: 'asoming <185788094+asoming@users.noreply.github.com>',
    desktop: { entry: { Name: '日序', 'Name[en]': 'Rixu', Comment: 'Local-first desktop planning', StartupWMClass: 'io.rixu', Keywords: 'Tasks;Todo;Planner;Calendar;日序;计划;' } },
  },
  deb: {
    packageName: 'rixu', artifactName: 'Rixu-${version}-linux-x64.${ext}',
    depends: ['libgtk-3-0 | libgtk-3-0t64', 'libnss3', 'libgbm1', 'libasound2 | libasound2t64', 'libxss1', 'libx11-6', 'libxkbcommon0'],
  },
  win: { target: ['nsis'], icon: 'src/assets/icon.png', artifactName: 'Rixu-${version}-windows-${arch}-setup.${ext}' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: '日序', runAfterFinish: false, deleteAppDataOnUninstall: false },
  mac: {
    target: ['dmg', 'zip'], category: 'public.app-category.productivity', icon: 'src/assets/icon.png',
    identity: signedMac ? undefined : '-', hardenedRuntime: signedMac,
    notarize: signedMac && !!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD && !!process.env.APPLE_TEAM_ID,
    gatekeeperAssess: false,
  },
};
