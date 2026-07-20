# BHL VSCode Extension

VSCode extension providing BHL language support and debugging via the Language Server Protocol and Debug Adapter Protocol.

## Requirements

For LSP support you need to have a `bhl` executable available. The easiest way is to open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **BHL: Download LSP Release** — it fetches the [bitdotgames/BHL](https://github.com/bitdotgames/BHL/releases) `lsp-v*` releases, lets you pick a version compatible with your OS/architecture, then downloads, checksum-verifies, and extracts a self-contained binary (no `dotnet` required). The extension automatically points `bhl.executablePath` at the downloaded binary.

To remove a downloaded release, run **BHL: Remove Downloaded LSP Release**.

Alternatively, you can point `bhl.executablePath` at your own `bhl`/`bhl.bat` build (see Configuration below).

<img width="1318" height="378" alt="image" src="https://github.com/user-attachments/assets/ab9041e6-8d07-4559-81ab-777a8604e540" />


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
| `bhl.executablePath` | `""` | Path to the `bhl` executable (on Windows it's `bhl.exe` or a **bhl.bat** script). Set automatically after running **BHL: Download LSP Release**, or point it at your own build, e.g. Linux/Mac: `/Users/bob/BHL/bhl`, Windows: `C:\BHL\bhl.bat`. If not set falls back to `bhl` on `PATH`. |
| `bhl.logFile` | `""` | If set, the LSP server writes its log to this file (`--log-file=<path>`). |
| `bhl.forceRebuild` | `false` | Forces LSP server rebuild on startup by setting `BHL_REBUILD=1`. Useful during active development of the LSP server when using your own source-built `bhl`. |

Settings can be changed in **Code > Settings > Extensions** under the **BHL** section.
