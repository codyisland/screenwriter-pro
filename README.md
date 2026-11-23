# Screenwriter Pro (Windows)

Windows port of the Screenwriter Pro macOS app. The same web app the Mac version
bundles (`resources/web`) runs inside an Electron shell (`main.js`, `preload.js`)
that implements the native bridge: open/save dialogs, printing, the persistent
store, the menu bar and the window title.

## Install

Download `Screenwriter-Pro-Setup-<version>.exe` from the
[Releases](../../releases) page and run it. Windows SmartScreen may warn because
the installer is not code-signed: click **More info → Run anyway**.

## Build

The installer is built by GitHub Actions on every push to `master`
(artifact) and on `v*` tags (GitHub Release). To build on a Windows PC or a Mac:

```
npm install
npm run dist
```

The installer lands in `dist/`. Run the app without installing: `npm start`.
On a Mac, build from a short path on an APFS volume: NSIS crashes on very long
paths, and exFAT drives add `._*` files that break packaging.
