# BHL VSCode Extension

VSCode extension providing BHL language support via the Language Server Protocol.

## Requirements

The `bhl` executable must be available — either on your `PATH` or configured explicitly (see below). The extension launches it as `bhl lsp` to start the language server.

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
| `bhl.executablePath` | `""` | Path to the `bhl` executable. Falls back to `bhl` on `PATH`. Supports extra arguments (e.g. `/path/to/bhl --some-flag`). |
| `bhl.logFile` | `""` | If set, the LSP server writes its log to this file (`--log-file=<path>`). |
| `bhl.forceRebuild` | `false` | Force a full project rebuild on startup by setting `BHL_REBUILD=1`. |

Settings can be changed in **File → Preferences → Settings** under the **BHL** section, or directly in `settings.json`:

```json
{
  "bhl.executablePath": "/path/to/bhl",
  "bhl.logFile": "/tmp/bhl-lsp.log",
  "bhl.forceRebuild": false
}
```
