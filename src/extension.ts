'use strict';

import * as fs from 'fs';
import * as path from 'path';
import { workspace, commands, window, ProgressLocation, ExtensionContext, Uri } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { activateDebug } from './debug';
import { BhlRelease, currentPlatformSuffix, fetchReleases, findAsset, installRelease, releaseVersion } from './download';

let client: LanguageClient;

const DOWNLOADED_BINARY_PATH_KEY = 'bhl.downloadedBinaryPath';

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

  const useCustomInstallation = config.get<boolean>('useCustomInstallation') ?? false;
  const customPath = config.get<string>('executablePath') || '';
  const downloadedBinaryPath = context.globalState.get<string>(DOWNLOADED_BINARY_PATH_KEY) || '';

  // IMPORTANT: treat the resolved path as a full path, do NOT split on spaces
  const serverCommand = (useCustomInstallation ? customPath : downloadedBinaryPath) || 'bhl';
  const logFile = config.get<string>('logFile') || '';
  const forceRebuild = useCustomInstallation && (config.get<boolean>('forceRebuild') ?? false);

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

  const installsRoot = path.join(context.globalStorageUri.fsPath, 'lsp-releases');

  context.subscriptions.push(
    commands.registerCommand('bhl.selectProjectFile', async () => {
      const selected = await pickProjectFile();
      if (!selected) return;
      await commands.executeCommand('vscode.openFolder', Uri.file(path.dirname(selected)));
    }),
    commands.registerCommand('bhl.downloadRelease', async () => {
      try {
        const platformSuffix = currentPlatformSuffix();
        if (!platformSuffix) {
          window.showErrorMessage(`Unsupported platform for prebuilt BHL binaries (${process.platform}/${process.arch}).`);
          return;
        }

        const releases = await window.withProgress(
          { location: ProgressLocation.Notification, title: 'BHL: Fetching releases...', cancellable: false },
          () => fetchReleases()
        );
        const compatible = releases.filter(r => findAsset(r, platformSuffix));
        if (compatible.length === 0) {
          window.showInformationMessage('No compatible BHL LSP releases found for this platform.');
          return;
        }

        const currentVersion = workspace.getConfiguration('bhl').get<string>('downloadedReleaseVersion');
        const picked = await window.showQuickPick(
          compatible.map(r => ({
            label: releaseVersion(r),
            description: releaseVersion(r) === currentVersion ? 'currently installed' : undefined,
            release: r,
          })),
          { title: 'Select BHL LSP Release', placeHolder: 'Pick a version to download' }
        );
        if (!picked) return;
        const release: BhlRelease = picked.release;

        const binaryPath = await window.withProgress(
          { location: ProgressLocation.Notification, title: `BHL: Downloading ${releaseVersion(release)}...`, cancellable: false },
          (progress) => installRelease(release, installsRoot, message => progress.report({ message }))
        );

        await context.globalState.update(DOWNLOADED_BINARY_PATH_KEY, binaryPath);
        await workspace.getConfiguration('bhl').update('downloadedReleaseVersion', releaseVersion(release), true);
        window.showInformationMessage(
          `Downloaded BHL ${releaseVersion(release)} to: ${binaryPath}\n\nUsed automatically unless "Use Custom Installation" is enabled.`
        );
      } catch (err: any) {
        window.showErrorMessage(`BHL release download failed: ${err.message ?? err}`);
      }
    }),
    commands.registerCommand('bhl.removeDownloadedRelease', async () => {
      if (!fs.existsSync(installsRoot)) {
        window.showErrorMessage('No downloaded BHL release found — nothing to remove.');
        return;
      }
      const choice = await window.showWarningMessage(
        `Remove downloaded BHL LSP releases at:\n${installsRoot}`,
        { modal: true },
        'Remove'
      );
      if (choice !== 'Remove') return;

      try {
        fs.rmSync(installsRoot, { recursive: true, force: true });
        await context.globalState.update(DOWNLOADED_BINARY_PATH_KEY, undefined);
        await workspace.getConfiguration('bhl').update('downloadedReleaseVersion', undefined, true);
        window.showInformationMessage('Downloaded BHL LSP releases removed.');
      } catch (err: any) {
        window.showErrorMessage(`BHL release removal failed: ${err.message ?? err}`);
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
