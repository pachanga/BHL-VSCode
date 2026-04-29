# BHL VSCode Extension

VSCode extension providing BHL language support via the Language Server Protocol.

## Requirements

You need to have BHL LSP server installed somewhere. For simplicity you just can clone [BHL repository](https://github.com/bitdotgames/BHL) to some directory. In VSCode settings you can configure the extension to use a path to the `bhl` script from the cloned BHL directory (see below). The extension launches it as `path/to/BHL/bhl lsp` to start the language server.

## Installation

### From GitHub Releases (recommended)

1. Download the latest `bhl-*.vsix` from [Releases](../../releases).
2. In VSCode open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Extensions: Install from VSIX…**
3. Select the downloaded file.

### Via command line

```sh
code --install-extension bhl-<version>.vsix
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bhl.executablePath` | `""` | Path to the `bhl` executable (On Windows it's a **bhl.bat** script). For example, Linux and Mac: `/Users/bob/BHL/bhl`, Windows: `C:\BHL\bhl.bat`. If not set falls back to `bhl` on `PATH`. You can pass extra arguments (e.g. `/Users/bob/BHL/bhl --some-flag`). |
| `bhl.logFile` | `""` | If set, the LSP server writes its log to this file (`--log-file=<path>`). |
| `bhl.forceRebuild` | `true` | Forces LSP server rebuild on startup by setting `BHL_REBUILD=1`. Useful during active development of an LSP server. |

Settings can be changed in **Code > Settings > Extensions** under the **BHL** section

## Usage

Start using the extension by opening the directory which contains **bhl.proj** file. Try opening any .bhl file. If everything is correct you should see **"Indexing BHL scripts"** small notification window. 
