# BHL VSCode Extension

VSCode extension providing BHL language support via the Language Server Protocol.

## Requirements

You need to have BHL installed somewhere. For simplicity you just can clone [BHL repository](https://github.com/bitdotgames/BHL) to some directory. Once extension is setup in VSCode you will be able to configure a path to the bhl script (see below). The extension launches it as `path/to/BHL/bhl lsp` to start the language server.

## Installation

### From GitHub Releases (recommended)

1. Download the latest `bhl-*.vsix` from [Releases](../../releases).
2. In VSCode open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Extensions: Install from VSIX…**
3. Select the downloaded file.

### Via command line

```sh
code --install-extension bhl-<version>.vsix
```

### Build from source

```sh
make install
```

This compiles, packages, and installs the extension in one step. Requires Node.js and `npm`.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bhl.executablePath` | `""` | Path to the `bhl` executable (On Windows it's a **bhl.bat** script). For example, Linux and Mac: `/Users/bob/bhl/bhl`, Windows: `C:\bhl\bhl.bat`. If not set falls back to `bhl` on `PATH`. You can pass extra arguments (e.g. `/Users/bob/bhl/bhl --some-flag`). |
| `bhl.logFile` | `""` | If set, the LSP server writes its log to this file (`--log-file=<path>`). |
| `bhl.forceRebuild` | `true` | Forces LSP server rebuild on startup by setting `BHL_REBUILD=1`. Useful during active development of an LSP server. |

Settings can be changed in **File → Preferences → Settings** under the **BHL** section, or directly in `settings.json`:

```json
{
  "bhl.executablePath": "/path/to/bhl",
  "bhl.logFile": "/tmp/bhl-lsp.log",
  "bhl.forceRebuild": false
}
```
