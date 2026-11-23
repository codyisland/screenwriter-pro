/*
 * Stamps the icon and version info into the Windows .exe with resedit (pure JS),
 * so the installer also builds on Macs, where rcedit would need a working Wine.
 */
const fs = require('fs');
const path = require('path');

exports.default = async (context) => {
  if (context.electronPlatformName !== 'win32') return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');
  const { appInfo, projectDir } = context.packager;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);

  const exe = NtExecutable.from(fs.readFileSync(exePath));
  const res = NtExecutableResource.from(exe);

  const ico = Data.IconFile.from(fs.readFileSync(path.join(projectDir, 'build', 'icon.ico')));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, groups[0].id, groups[0].lang, ico.icons.map(i => i.data));

  const vi = Resource.VersionInfo.fromEntries(res.entries)[0];
  const [major, minor, patch] = appInfo.version.split('.').map(Number);
  vi.setFileVersion(major, minor, patch, 0);
  vi.setProductVersion(major, minor, patch, 0);
  vi.setStringValues(vi.getAllLanguagesForStringValues()[0], {
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    CompanyName: appInfo.companyName || appInfo.productName,
    LegalCopyright: appInfo.copyright,
    InternalName: appInfo.productName,
    OriginalFilename: `${appInfo.productFilename}.exe`
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
};
