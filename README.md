# BHL VSCode Extension

VSCode extension providing BHL language support and debugging via the Language Server Protocol and Debug Adapter Protocol.

## Requirements

For LSP support you need to have a `bhl` executable available. The easiest way is to open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **BHL: Manage LSP Versions** — it shows a picker listing the [bitdotgames/BHL](https://github.com/bitdotgames/BHL/releases) `lsp-v*` releases compatible with your OS/architecture (with release dates, sizes, and "latest"/prerelease/installed labels), plus a "Remove downloaded release" entry when one is installed. Selecting a version downloads, checksum-verifies, and extracts a self-contained binary (no `dotnet` required). The extension picks up the change immediately — no window reload needed.

To switch to a custom installation instead, enable `bhl.useCustomInstallation` and point `bhl.useCustomInstallationExecutablePath` at your own `bhl`/`bhl.bat` build.

The status bar shows which one is currently active (e.g. `BHL: v0.3.5` or `BHL: custom (bhl.bat)`) — click it to open the version picker.


## Installation

### From GitHub Releases (recommended)

1. Download the latest `bhl-*.vsix` from [Releases](../../releases).
2. In VSCode open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Extensions: Install from VSIX…**
3. Select the downloaded file.

### Via command line

```sh
code --install-extension bhl-<version>.vsix
```

## Language support

Start using the extension by opening the directory which contains a **bhl.proj** file. Try opening any `.bhl` file. If everything is correct you should see **"Indexing BHL scripts"** small notification window.

## Debugging

The extension includes a DAP client that connects to the BHL debug server running inside Unity over TCP.

1. Add a `launch.json` to your project's `.vscode/` folder (VSCode can generate one automatically via **Add Configuration…**):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "bhl",
      "request": "attach",
      "name": "Attach to BHL (Unity)",
      "host": "localhost",
      "port": 7777
    }
  ]
}
```

2. Press **Play** in Unity — the console prints `BHL debug server listening on port 7777`.
3. In VSCode open the **Run & Debug** panel and click **Attach to BHL (Unity)**.
4. Set breakpoints in `.bhl` files by clicking the gutter.
5. When execution hits a breakpoint, Unity freezes and VSCode shows the call stack and local variables.
6. Press **Continue** (F5) to resume.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bhl.downloadedReleaseVersion` | `""` | Version of the currently downloaded LSP release (empty if none). |
| `bhl.forceRebuild` | `false` | Forces LSP server rebuild on startup by setting `BHL_REBUILD=1`. Only applies when `bhl.useCustomInstallation` is enabled. Useful during active development of the LSP server when using your own source-built `bhl`. |
| `bhl.logFile` | `""` | If set, the LSP server writes its log to this file (`--log-file=<path>`). |
| `bhl.useCustomInstallation` | `false` | Use `bhl.useCustomInstallationExecutablePath` instead of a downloaded LSP release to launch the server. |
| `bhl.useCustomInstallationExecutablePath` | `""` | Path to a custom `bhl` executable (on Windows it's `bhl.exe` or a **bhl.bat** script). Only used when `bhl.useCustomInstallation` is enabled, e.g. Linux/Mac: `/Users/bob/BHL/bhl`, Windows: `C:\BHL\bhl.bat`. Falls back to `bhl` on `PATH` if left empty. |

`bhl.executablePath` was renamed to `bhl.useCustomInstallationExecutablePath`; any existing value is migrated automatically on startup (it no longer appears in Settings UI).

Settings can be changed in **Code > Settings > Extensions** under the **BHL** section.
