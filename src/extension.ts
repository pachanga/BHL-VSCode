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

  const internalCloneDir = path.join(context.globalStorageUri.fsPath, 'BHL');
  const internalScriptName = process.platform === 'win32' ? 'bhl.cmd' : 'bhl';
  const internalScriptPath = path.join(internalCloneDir, internalScriptName);

  context.subscriptions.push(
    client,
    commands.registerCommand('bhl.useRepository', async () => {
      try {
        if (!fs.existsSync(internalCloneDir)) {
          fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

          await window.withProgress(
            { location: ProgressLocation.Notification, title: 'BHL: Cloning repository...', cancellable: false },
            () => runCommand('git', ['clone', BHL_REPO_URL, internalCloneDir], context.globalStorageUri.fsPath)
          );
        }

        await workspace.getConfiguration('bhl').update('executablePath', internalScriptPath, true);
        window.showInformationMessage(`BHL executable path set to: ${internalScriptPath}`);
      } catch (err: any) {
        window.showErrorMessage(`BHL repository clone failed: ${err.message ?? err}`);
      }
    }),
    commands.registerCommand('bhl.updateRepository', async () => {
      try {
        if (fs.existsSync(internalCloneDir)) {
          await window.withProgress(
            { location: ProgressLocation.Notification, title: 'BHL: Pulling latest changes...', cancellable: false },
            () => runCommand('git', ['-C', internalCloneDir, 'pull'], internalCloneDir)
          );
          window.showInformationMessage('BHL repository updated successfully.');
        } else {
          fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

          await window.withProgress(
            { location: ProgressLocation.Notification, title: 'BHL: Cloning repository...', cancellable: false },
            () => runCommand('git', ['clone', BHL_REPO_URL, internalCloneDir], context.globalStorageUri.fsPath)
          );

          await workspace.getConfiguration('bhl').update('executablePath', internalScriptPath, true);
          window.showInformationMessage(`BHL repository ready. Executable path set to: ${internalScriptPath}`);
        }
      } catch (err: any) {
        window.showErrorMessage(`BHL repository update failed: ${err.message ?? err}`);
      }
    }),
    commands.registerCommand('bhl.removeRepository', async () => {
      if (!fs.existsSync(internalCloneDir)) {
        window.showErrorMessage('Internal BHL repository not found — nothing to remove.');
        return;
      }
      const choice = await window.showWarningMessage(
        `Remove internal BHL repository at:\n${internalCloneDir}`,
        { modal: true },
        'Remove'
      );
      if (choice !== 'Remove') return;

      try {
        fs.rmSync(internalCloneDir, { recursive: true, force: true });
        await workspace.getConfiguration('bhl').update('executablePath', undefined, true);
        window.showInformationMessage('Internal BHL repository removed.');
      } catch (err: any) {
        window.showErrorMessage(`BHL repository removal failed: ${err.message ?? err}`);
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
