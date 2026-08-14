'use strict';

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as cp from 'child_process';
import AdmZip = require('adm-zip');
// Untyped: tar's bundled .d.ts targets a newer TypeScript/@types-node than this project pins.
const tar = require('tar');

const RELEASES_URL = 'https://api.github.com/repos/bitdotgames/BHL/releases?per_page=30';
const USER_AGENT = 'BHL-VSCode-Extension';
const MAX_REDIRECTS = 5;

export const DOWNLOADED_BINARY_PATH_KEY = 'bhl.downloadedBinaryPath';

export interface BhlReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface BhlRelease {
  tagName: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string;
  assets: BhlReleaseAsset[];
}

function stripLspTagPrefix(tagName: string): string {
  return tagName.replace(/^lsp-/, '');
}

/** `lsp-v0.3.1` -> `v0.3.1`, matching the version embedded in asset file names. */
export function releaseVersion(release: BhlRelease): string {
  return stripLspTagPrefix(release.tagName);
}

/**
 * Recovers the installed version from `installRelease`'s own layout
 * (`installsRoot/<tagName>/<platformSuffix>/bhl[.exe]`) instead of tracking it separately —
 * the binary path is the only thing actually used to launch the server, so deriving the
 * version display from it means the two can never drift out of sync.
 */
export function versionFromBinaryPath(binaryPath: string): string | undefined {
  if (!binaryPath) return undefined;
  const tagName = path.basename(path.dirname(path.dirname(binaryPath)));
  return tagName.startsWith('lsp-') ? stripLspTagPrefix(tagName) : undefined;
}

export function formatReleaseSize(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatReleaseDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function httpGet(url: string, headers: Record<string, string>, redirects = 0): Promise<{ statusCode: number; headers: NodeJS.Dict<string | string[]>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, res => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          resolve(httpGet(res.headers.location, headers, redirects + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ statusCode: status, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function downloadToFile(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  onProgress: (pct: number | undefined) => void,
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, res => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          downloadToFile(res.headers.location, destPath, headers, onProgress, redirects + 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Request to ${url} failed with status ${status}`));
          return;
        }

        const total = Number(res.headers['content-length'] ?? 0) || undefined;
        let received = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', chunk => {
          received += chunk.length;
          onProgress(total ? Math.round((received / total) * 100) : undefined);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/** All non-draft `lsp-v*` releases, newest first (GitHub's own listing order). */
export async function fetchReleases(): Promise<BhlRelease[]> {
  const { body } = await httpGet(RELEASES_URL, {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
  });
  const raw = JSON.parse(body.toString('utf8'));
  const releases: BhlRelease[] = raw.map((r: any) => ({
    tagName: r.tag_name,
    draft: r.draft,
    prerelease: r.prerelease,
    publishedAt: r.published_at,
    assets: (r.assets ?? []).map((a: any) => ({ name: a.name, downloadUrl: a.browser_download_url, size: a.size })),
  }));
  return releases.filter(r => !r.draft && r.tagName.startsWith('lsp-v'));
}

/** e.g. `"osx-arm64"`, `"linux-x64"`, `"win-x64"` -- `undefined` if this platform has no published asset. */
export function currentPlatformSuffix(): string | undefined {
  const os = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : undefined;
  if (!os) return undefined;

  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : undefined;
  if (!arch) return undefined;

  // No win-arm64 asset is published as of lsp-v0.3.1.
  if (os === 'win' && arch === 'arm64') return undefined;

  return `${os}-${arch}`;
}

export function findAsset(release: BhlRelease, platformSuffix: string): BhlReleaseAsset | undefined {
  return release.assets.find(a => a.name.endsWith(`-${platformSuffix}.tar.gz`) || a.name.endsWith(`-${platformSuffix}.zip`));
}

function findChecksumAsset(release: BhlRelease, binaryAsset: BhlReleaseAsset): BhlReleaseAsset | undefined {
  const prefix = binaryAsset.name.replace(/\.tar\.gz$/, '').replace(/\.zip$/, '');
  return release.assets.find(a => a.name === `${prefix}.sha256`);
}

/** Deletes every cached release directory except `keepTagName`'s. Best-effort: a locked file
 * (e.g. the old binary still running as a subprocess) shouldn't fail the new install. */
function cleanupOtherInstalls(installsRoot: string, keepTagName: string): void {
  if (!fs.existsSync(installsRoot)) return;
  for (const entry of fs.readdirSync(installsRoot)) {
    if (entry !== keepTagName) {
      try {
        fs.rmSync(path.join(installsRoot, entry), { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
}

function sha256Hex(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function findFirstRegularFile(root: string): string | undefined {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFirstRegularFile(full);
      if (found) return found;
    } else if (entry.isFile()) {
      return full;
    }
  }
  return undefined;
}

/** Every published archive contains exactly one file: the `bhl`/`bhl.exe` executable. */
async function extractSingleBinary(archivePath: string, assetName: string, destination: string): Promise<void> {
  if (assetName.endsWith('.zip')) {
    const zip = new AdmZip(archivePath);
    const entry = zip.getEntries().find((e: any) => !e.isDirectory);
    if (!entry) throw new Error(`${assetName} is empty`);
    fs.writeFileSync(destination, entry.getData());
  } else {
    const scratchDir = `${destination}.extract-tmp`;
    fs.rmSync(scratchDir, { recursive: true, force: true });
    fs.mkdirSync(scratchDir, { recursive: true });
    try {
      await tar.x({ file: archivePath, cwd: scratchDir });
      const extracted = findFirstRegularFile(scratchDir);
      if (!extracted) throw new Error(`${assetName} is empty`);
      fs.renameSync(extracted, destination);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  }
}

/**
 * Gatekeeper can refuse to run a freshly-downloaded, unsigned/ad-hoc-signed binary
 * ("cannot be opened because Apple could not verify...") if macOS tags it with the
 * `com.apple.quarantine` extended attribute. Strip it defensively; `xattr -d` exits non-zero
 * when the attribute is simply absent, which is the common case and not a failure.
 */
function removeQuarantineAttribute(binaryPath: string): void {
  try {
    cp.spawnSync('xattr', ['-d', 'com.apple.quarantine', binaryPath]);
  } catch {
    // best-effort
  }
}

export type InstallProgress = (message: string) => void;

/**
 * Downloads, verifies (against the release's `.sha256` sibling asset) and extracts `release`'s
 * binary for the current platform under `installsRoot`, returning the path to the executable.
 * A no-op (besides an existence check) if it's already installed.
 */
export async function installRelease(release: BhlRelease, installsRoot: string, onProgress: InstallProgress): Promise<string> {
  const platformSuffix = currentPlatformSuffix();
  if (!platformSuffix) {
    throw new Error(`No BHL binary is published for this platform (${process.platform}/${process.arch})`);
  }
  const asset = findAsset(release, platformSuffix);
  if (!asset) {
    throw new Error(`Release ${release.tagName} has no binary for ${platformSuffix}`);
  }

  cleanupOtherInstalls(installsRoot, release.tagName);

  const installDir = path.join(installsRoot, release.tagName, platformSuffix);
  const binaryPath = path.join(installDir, platformSuffix.startsWith('win') ? 'bhl.exe' : 'bhl');
  if (fs.existsSync(binaryPath)) return binaryPath;

  fs.mkdirSync(installDir, { recursive: true });
  const archivePath = path.join(installDir, asset.name);
  try {
    onProgress(`Downloading ${asset.name}…`);
    await downloadToFile(asset.downloadUrl, archivePath, { 'User-Agent': USER_AGENT }, pct => {
      onProgress(pct !== undefined ? `Downloading ${asset.name}… ${pct}%` : `Downloading ${asset.name}…`);
    });

    // Mandatory, not best-effort: this binary runs unsandboxed as a subprocess, so a corrupted
    // or tampered download must fail loudly rather than get installed anyway.
    const checksumAsset = findChecksumAsset(release, asset);
    if (!checksumAsset) {
      throw new Error(`${release.tagName} has no .sha256 checksum for ${asset.name} — refusing to install unverified`);
    }
    onProgress('Verifying checksum…');
    const { body } = await httpGet(checksumAsset.downloadUrl, { 'User-Agent': USER_AGENT });
    const expected = body.toString('utf8').trim().split(' ')[0].toLowerCase();
    const actual = await sha256Hex(archivePath);
    if (expected !== actual) {
      throw new Error(`Checksum mismatch for ${asset.name}: expected ${expected}, got ${actual}`);
    }

    onProgress(`Extracting ${asset.name}…`);
    await extractSingleBinary(archivePath, asset.name, binaryPath);
  } finally {
    fs.rmSync(archivePath, { force: true });
  }

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`${asset.name} did not contain the expected ${binaryPath}`);
  }
  fs.chmodSync(binaryPath, 0o755);
  if (platformSuffix.startsWith('osx')) {
    removeQuarantineAttribute(binaryPath);
  }
  return binaryPath;
}
