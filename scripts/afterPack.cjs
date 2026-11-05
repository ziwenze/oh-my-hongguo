const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function (context) {
  if (context.electronPlatformName === 'darwin') {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`[afterPack] Performing ad-hoc deep code signing on: ${appPath}`);
    execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
    execSync(`codesign -vvv --deep --strict "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] Ad-hoc deep code signing completed and verified.');
  }
};
