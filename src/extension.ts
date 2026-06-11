'use strict';

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { workspace, commands, window, ProgressLocation, ExtensionContext, Uri } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { activateDebug } from './debug';

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

async function findProjectFile(): Promise<string | undefined> {
  const files = await workspace.findFiles('**/bhl.proj');
  if (files.length === 0) return undefined;
  if (files.length === 1) return files[0].fsPath;
  const items = files.map(f => ({ label: workspace.asRelativePath(f), fsPath: f.fsPath }));
  const picked = await window.showQuickPick(items, {
    title: 'Select BHL Project',
    placeHolder: 'Multiple bhl.proj files found',
  });
  return picked?.fsPath;
}

async function pickProjectFile(): Promise<string | undefined> {
  const uris = await window.showOpenDialog({
    canSelectMany: false,
    filters: { 'BHL Project': ['proj'] },
    openLabel: 'Select bhl.proj',
    title: 'Select BHL Project File',
  });
  return uris?.[0]?.fsPath;
}


function startClient(context: ExtensionContext, projFile: string | undefined): LanguageClient {
  const config = workspace.getConfiguration('bhl');

  // IMPORTANT: treat executablePath as a full path, do NOT split on spaces
  const serverCommand = config.get<string>('executablePath') || 'bhl';
  const logFile = config.get<string>('logFile') || '';
  const forceRebuild = config.get<boolean>('forceRebuild') ?? true;

  const args: string[] = ['lsp'];
  if (logFile) {
    args.push(`--log-file=${logFile}`);
  }

  // Detect Windows batch scripts
  const isWindowsBatch =
    process.platform === 'win32' && /\.bat$/i.test(serverCommand);

  const serverOptions: ServerOptions = {
    command: serverCommand,
    args,
    options: {
      env: {
        ...process.env,
        ...(forceRebuild ? { BHL_REBUILD: '1', BHL_SILENT: '1' } : {}),
      },
      ...(isWindowsBatch ? { shell: true } : {}),
      ...(projFile ? { cwd: path.dirname(projFile) } : {}),
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'bhl' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.bhl'),
    },
  };

  const newClient = new LanguageClient('bhl', 'BHL Language Server', serverOptions, clientOptions);
  context.subscriptions.push(newClient);
  newClient.start();
  return newClient;
}

export async function activate(context: ExtensionContext) {
  const projFile = await findProjectFile();
  if (projFile !== undefined) {
    client = startClient(context, projFile);
  }
  activateDebug(context);

  const internalCloneDir = path.join(context.globalStorageUri.fsPath, 'BHL');
  const internalScriptName = process.platform === 'win32' ? 'bhl.bat' : 'bhl';
  const internalScriptPath = path.join(internalCloneDir, internalScriptName);

  context.subscriptions.push(
    commands.registerCommand('bhl.selectProjectFile', async () => {
      const selected = await pickProjectFile();
      if (!selected) return;
      await commands.executeCommand('vscode.openFolder', Uri.file(path.dirname(selected)));
    }),
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
