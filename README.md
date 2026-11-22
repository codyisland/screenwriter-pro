# Screenwriter Pro (Windows) - Tauri Build

Windows port of Screenwriter Pro using Tauri 2.0 + Rust + WebView2.

## Prerequisites

1. **Node.js 18+** - https://nodejs.org/
2. **Rust** - https://rustup.rs/
3. **WebView2 Runtime** - Included with Windows 10/11, or install from Microsoft Edge WebView2

## Setup

```bash
cd "/Volumes/Music Drive/Coding/Screenwriter Pro (Windows)"
npm install
```

## Development

```bash
npm run tauri:dev
```

This starts the Tauri dev server with hot reload.

## Build for Windows

```bash
npm run tauri:build
```

Outputs:
- **MSI installer** - `src-tauri/target/release/bundle/msi/`
- **NSIS installer** - `src-tauri/target/release/bundle/nsis/`
- **Portable executable** - `src-tauri/target/release/screenwriter-pro.exe`

## Project Structure

```
Screenwriter Pro (Windows)/
├── dist/                 # Web assets (copied from macOS app)
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── icons/
│   └── manifest.webmanifest
├── src-tauri/            # Tauri/Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/            # App icons (.ico, .png, .icns)
│   └── src/
│       └── main.rs       # Rust entry point with Tauri commands
├── package.json
└── README.md
```

## Key Differences from macOS Version

| Feature | macOS (WKWebView) | Windows (WebView2) |
|---------|-------------------|---------------------|
| Native Bridge | `webkit.messageHandlers.native` | `window.__TAURI__.core.invoke` |
| File Dialogs | Native macOS panels | Windows Common Dialogs |
| Menus | Native macOS menu bar | Tauri menu (in window) |
| Storage | AppSupport files | Tauri store plugin |
| Printing | Native macOS print | WebView2 print dialog |

## Tauri Commands (Rust ↔ JS)

| Command | Description |
|---------|-------------|
| `native_save_as` | Save As dialog |
| `native_open` | Open file dialog |
| `native_save` | Save (with optional path) |
| `native_print` | Print document |
| `native_store_get` | Get stored value |
| `native_store_set` | Set stored value |
| `native_store_del` | Delete stored value |

## Icons

The following icon files are required in `src-tauri/icons/`:
- `icon.ico` - Windows installer/icon (multi-resolution)
- `32x32.png` - Taskbar icon
- `128x128.png` - App icon
- `128x128@2x.png` - High-DPI app icon
- `icon.icns` - macOS icon (for cross-platform builds)

## Building on Windows

For actual Windows builds, run on a Windows machine or use GitHub Actions:

```yaml
# .github/workflows/build-windows.yml
name: Build Windows
on: [push, workflow_dispatch]
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run tauri:build
      - uses: actions/upload-artifact@v4
        with:
          name: screenwriter-pro-windows
          path: src-tauri/target/release/bundle/
```