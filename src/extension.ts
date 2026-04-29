'use strict';

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { workspace, commands, window, ProgressLocation, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient;

const BHL_REPO_URL = 'https://github.com/bitdotgames/BHL';

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

export function activate(context: ExtensionContext) {
  const config = workspace.getConfiguration('bhl');

  // IMPORTANT: treat executablePath as a full path, do NOT split on spaces
  const serverCommand = config.get<string>('executablePath') || 'bhl';
  const logFile = config.get<string>('logFile') || '';
  const forceRebuild = config.get<boolean>('forceRebuild') ?? true;

  const command = serverCommand;
  const args: string[] = ['lsp'];

  if (logFile) {
    args.push(`--log-file=${logFile}`);
  }

  // Detect Windows batch scripts
  const isWindowsBatch =
    process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);

  const serverOptions: ServerOptions = {
    command,
    args,
    options: {
      env: {
        ...process.env,
        ...(forceRebuild
          ? { BHL_REBUILD: '1', BHL_SILENT: '1' }
          : {}),
      },
      // Required for .bat/.cmd on Windows
      ...(isWindowsBatch ? { shell: true } : {}),
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'bhl' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.bhl'),
    },
  };

  client = new LanguageClient(
    'bhl',
    'BHL Language Server',
    serverOptions,
    clientOptions
  );

  client.start();

  context.subscriptions.push(
    client,
    commands.registerCommand('bhl.cloneRepository', async () => {
      const cloneDir = path.join(context.globalStorageUri.fsPath, 'BHL');
      const scriptName = process.platform === 'win32' ? 'bhl.cmd' : 'bhl';
      const scriptPath = path.join(cloneDir, scriptName);

      try {
        if (fs.existsSync(cloneDir)) {
          const choice = await window.showWarningMessage(
            `BHL repository already exists at:\n${cloneDir}\n\nPull latest changes?`,
            'Pull', 'Cancel'
          );
          if (choice !== 'Pull') return;

          await window.withProgress(
            { location: ProgressLocation.Notification, title: 'BHL: Pulling latest changes...', cancellable: false },
            () => runCommand('git', ['-C', cloneDir, 'pull'], cloneDir)
          );
        } else {
          fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

          await window.withProgress(
            { location: ProgressLocation.Notification, title: 'BHL: Cloning repository...', cancellable: false },
            () => runCommand('git', ['clone', BHL_REPO_URL, cloneDir], context.globalStorageUri.fsPath)
          );
        }

        await workspace.getConfiguration('bhl').update('executablePath', scriptPath, true);
        window.showInformationMessage(`BHL repository ready. Executable path set to: ${scriptPath}`);
      } catch (err: any) {
        window.showErrorMessage(`BHL clone failed: ${err.message ?? err}`);
      }
    })
    // Uncomment if needed later:
    // commands.registerCommand('bhl.reload', () => {
    //   client.sendRequest('workspace/executeCommand', { command: 'bhl.reload' });
    // })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
