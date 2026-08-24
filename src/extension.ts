'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {
  workspace,
  commands,
  window,
  ExtensionContext,
  ProgressLocation,
  QuickPickItem,
  QuickPickItemKind,
  StatusBarAlignment,
  StatusBarItem,
  Uri,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { activateDebug } from './debug';
import {
  BhlRelease,
  DOWNLOADED_BINARY_PATH_KEY,
  currentPlatformSuffix,
  fetchReleases,
  findAsset,
  formatReleaseDate,
  formatReleaseSize,
  installRelease,
  releaseVersion,
  versionFromBinaryPath,
} from './download';

let client: LanguageClient | undefined;
let statusBarItem: StatusBarItem;

function statusBarLabel(context: ExtensionContext): string {
  const config = workspace.getConfiguration('bhl');
  if (config.get<boolean>('useCustomInstallation') ?? false) {
    const customPath = config.get<string>('useCustomInstallationExecutablePath') || '';
    return customPath ? `BHL: custom (${path.basename(customPath)})` : 'BHL: custom (no path set)';
  }
  const binaryPath = context.globalState.get<string>(DOWNLOADED_BINARY_PATH_KEY) || '';
  const version = versionFromBinaryPath(binaryPath);
  return version ? `BHL: ${version}` : 'BHL: no release installed';
}

/**
 * bhl.downloadedReleaseVersion is a display-only mirror of the binary path for the Settings
 * page (Settings UI can't show a plain read-only value, only an editable field or nothing).
 * Recomputing and correcting it here — called on every status bar refresh — means it can
 * never drift for long even if a write is missed somewhere.
 */
function selfHealDownloadedReleaseVersionSetting(context: ExtensionContext): void {
  const binaryPath = context.globalState.get<string>(DOWNLOADED_BINARY_PATH_KEY) || '';
  const derived = versionFromBinaryPath(binaryPath) || '';
  const config = workspace.getConfiguration('bhl');
  if ((config.get<string>('downloadedReleaseVersion') || '') !== derived) {
    config.update('downloadedReleaseVersion', derived || undefined, true).then(undefined, () => {});
  }
}

function updateStatusBarItem(context: ExtensionContext): void {
  statusBarItem.text = `$(plug) ${statusBarLabel(context)}`;
  selfHealDownloadedReleaseVersionSetting(context);
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


async function startOrRestartClient(context: ExtensionContext, projFile: string | undefined): Promise<void> {
  if (client) {
    await client.stop();
  }
  client = startClient(context, projFile);
  updateStatusBarItem(context);
}

/**
 * Applies a binary/config change to the language client only if one is already running.
 * Installing/removing a release shouldn't itself start the LSP server — e.g. there may be no
 * .bhl file open yet, or no bhl.proj found at all — it'll just pick up the change naturally
 * whenever it does start (or via "BHL: Reload Project").
 */
async function refreshClientIfRunning(context: ExtensionContext, projFile: string | undefined): Promise<void> {
  if (client) {
    await startOrRestartClient(context, projFile);
  } else {
    updateStatusBarItem(context);
  }
}

function startClient(context: ExtensionContext, projFile: string | undefined): LanguageClient {
  const config = workspace.getConfiguration('bhl');

  const useCustomInstallation = config.get<boolean>('useCustomInstallation') ?? false;
  const customPath = config.get<string>('useCustomInstallationExecutablePath') || '';
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

/**
 * One-time migration for the bhl.executablePath -> bhl.useCustomInstallationExecutablePath
 * rename. bhl.executablePath is intentionally undeclared now (so it doesn't show in Settings
 * UI at all) — reading an undeclared key is safe, but writing to one throws, so the stale
 * value is left in place rather than cleared. Only runs while the new key is still empty, so
 * it can't later clobber a value deliberately set (or cleared) through the new setting.
 */
async function migrateLegacyExecutablePathSetting(): Promise<void> {
  const config = workspace.getConfiguration('bhl');
  const legacyPath = config.get<string>('executablePath');
  if (!legacyPath || config.get<string>('useCustomInstallationExecutablePath')) return;
  try {
    await config.update('useCustomInstallationExecutablePath', legacyPath, true);
  } catch {
    // best-effort
  }
}

export async function activate(context: ExtensionContext) {
  await migrateLegacyExecutablePathSetting();

  const projFile = await findProjectFile();
  if (projFile !== undefined) {
    client = startClient(context, projFile);
  }
  activateDebug(context);

  const installsRoot = path.join(context.globalStorageUri.fsPath, 'lsp-releases');
  const restartClient = () => startOrRestartClient(context, projFile);
  const refreshClient = () => refreshClientIfRunning(context, projFile);

  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  statusBarItem.command = 'bhl.manageLspVersions';
  statusBarItem.tooltip = 'Manage BHL LSP versions';
  updateStatusBarItem(context);
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('bhl.useCustomInstallation') || e.affectsConfiguration('bhl.useCustomInstallationExecutablePath')) {
        updateStatusBarItem(context);
      }
    }),
    commands.registerCommand('bhl.selectProjectFile', async () => {
      const selected = await pickProjectFile();
      if (!selected) return;
      await commands.executeCommand('vscode.openFolder', Uri.file(path.dirname(selected)));
    }),
    // Deliberately NOT registering 'bhl.reload' here: the BHL LSP server dynamically registers
    // it itself (via workspace/executeCommand, part of a batched client/registerCapability call
    // together with semantic tokens, hover, completion, etc.). Registering the same command ID
    // client-side collides with that and fails the whole batch, silently breaking every feature
    // in it — semantic highlighting included. 'BHL: Restart LSP Client' below is for the
    // different case where the whole client process (not just the server's project state) needs
    // to be killed and restarted, e.g. after switching to a different downloaded binary.
    commands.registerCommand('bhl.restartLanguageClient', async () => {
      await restartClient();
    }),
    commands.registerCommand('bhl.manageLspVersions', async () => {
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

        const installedVersion = versionFromBinaryPath(context.globalState.get<string>(DOWNLOADED_BINARY_PATH_KEY) || '');
        const firstStableIndex = compatible.findIndex(r => !r.prerelease);

        type VersionPickItem = QuickPickItem & { release?: BhlRelease; action?: 'remove' };
        const items: VersionPickItem[] = [];
        if (installedVersion) {
          items.push({ label: '$(trash) Remove downloaded release', description: `currently ${installedVersion}`, action: 'remove' });
          items.push({ label: '', kind: QuickPickItemKind.Separator });
        }
        compatible.forEach((r, index) => {
          const version = releaseVersion(r);
          const asset = findAsset(r, platformSuffix)!;
          const tags: string[] = [];
          if (index === firstStableIndex) tags.push('latest');
          if (r.prerelease) tags.push('prerelease');
          if (version === installedVersion) tags.push('installed');
          items.push({
            label: version,
            description: tags.join(', ') || undefined,
            detail: [formatReleaseDate(r.publishedAt), formatReleaseSize(asset.size)].filter(Boolean).join(' · ') || undefined,
            release: r,
          });
        });

        const picked = await window.showQuickPick(items, {
          title: 'BHL LSP Versions',
          placeHolder: installedVersion ? `Currently installed: ${installedVersion}` : 'Select a version to install',
        });
        if (!picked) return;

        if (picked.action === 'remove') {
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
          fs.rmSync(installsRoot, { recursive: true, force: true });
          await context.globalState.update(DOWNLOADED_BINARY_PATH_KEY, undefined);
          await refreshClient();
          window.showInformationMessage('Downloaded BHL LSP release removed.');
          return;
        }

        const release = picked.release!;
        const binaryPath = await window.withProgress(
          { location: ProgressLocation.Notification, title: `BHL: Installing ${releaseVersion(release)}...`, cancellable: false },
          (progress) => installRelease(release, installsRoot, message => progress.report({ message }))
        );
        await context.globalState.update(DOWNLOADED_BINARY_PATH_KEY, binaryPath);
        await refreshClient();
        window.showInformationMessage(`Installed BHL ${releaseVersion(release)}. Used automatically unless "Use Custom Installation" is enabled.`);
      } catch (err: any) {
        window.showErrorMessage(`BHL LSP version management failed: ${err.message ?? err}`);
      }
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
