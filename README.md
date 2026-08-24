# BHL VSCode Extension

VSCode extension providing BHL language support and debugging via the Language Server Protocol and Debug Adapter Protocol.

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
| `bhl.useCustomInstallation` | `false` | Use a custom `bhl` executable instead of a downloaded LSP release. |
| `bhl.useCustomInstallationExecutablePath` | `""` | Path to the custom executable. Only used when `bhl.useCustomInstallation` is enabled. |
| `bhl.forceRebuild` | `false` | Rebuild the LSP server on startup (`BHL_REBUILD=1`). Custom installs only. |
| `bhl.logFile` | `""` | Path to the LSP log file. |

Full descriptions for each setting are shown in Settings UI under the **BHL** section.
