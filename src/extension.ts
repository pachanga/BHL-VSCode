'use strict';

import * as path from 'path';
import { workspace, commands, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient;

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
    client
    // Uncomment if needed later:
    // commands.registerCommand('bhl.reload', () => {
    //   client.sendRequest('workspace/executeCommand', { command: 'bhl.reload' });
    // })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
