'use strict';

import * as net from 'net';
import * as vscode from 'vscode';

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 7777;
const RETRY_MS = 1000;

let out: vscode.OutputChannel;

function log(msg: string): void {
  out.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function fmtBp(bp: vscode.Breakpoint): string {
  if (bp instanceof vscode.SourceBreakpoint) {
    const loc = bp.location;
    const file = loc.uri.fsPath.replace(/.*[/\\]/, '');
    const line = loc.range.start.line + 1;
    const cond = bp.condition ? ` cond=${bp.condition}` : '';
    return `${file}:${line}${cond} [${bp.enabled ? 'on' : 'off'}]`;
  }
  if (bp instanceof vscode.FunctionBreakpoint)
    return `fn:${bp.functionName} [${bp.enabled ? 'on' : 'off'}]`;
  return String(bp);
}

function waitForServer(host: string, port: number): Promise<void> {
  return new Promise(resolve => {
    let logged = false;

    function attempt(): void {
      const socket = net.createConnection(port, host);
      socket.setTimeout(RETRY_MS);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error',   () => { socket.destroy(); retry(); });
      socket.once('timeout', () => { socket.destroy(); retry(); });
    }

    function retry(): void {
      if (!logged) { logged = true; log(`Waiting for BHL server on ${host}:${port}...`); }
      setTimeout(attempt, RETRY_MS);
    }

    attempt();
  });
}

class DAPProxy implements vscode.DebugAdapter {
  private _emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this._emitter.event;
  private _buf = Buffer.alloc(0);
  private _socket: net.Socket;

  constructor(host: string, port: number) {
    this._socket = net.createConnection(port, host);
    this._socket.on('data',  chunk => { this._buf = Buffer.concat([this._buf, chunk]); this._drain(); });
    this._socket.on('error', err   => log(`DAP socket error: ${err.message}`));
    this._socket.on('close', ()    => log('DAP socket closed'));
  }

  handleMessage(msg: vscode.DebugProtocolMessage): void {
    logDAP('→', msg);
    const body   = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    this._socket.write(header + body, 'utf8');
  }

  private _drain(): void {
    while (true) {
      const sep = this._buf.indexOf('\r\n\r\n');
      if (sep === -1) break;
      const header  = this._buf.toString('utf8', 0, sep);
      const match   = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) break;
      const bodyLen = parseInt(match[1]);
      const start   = sep + 4;
      if (this._buf.length < start + bodyLen) break;
      const body    = this._buf.toString('utf8', start, start + bodyLen);
      this._buf     = this._buf.slice(start + bodyLen);
      try {
        const parsed = JSON.parse(body);
        logDAP('←', parsed);
        this._emitter.fire(parsed as vscode.DebugProtocolMessage);
      } catch (e: any) {
        log(`DAP parse error: ${e.message}`);
      }
    }
  }

  dispose(): void { this._socket.destroy(); }
}

class BHLDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  async createDebugAdapterDescriptor(session: vscode.DebugSession): Promise<vscode.DebugAdapterDescriptor> {
    const host: string = session.configuration.host || DEFAULT_HOST;
    const port: number = session.configuration.port || DEFAULT_PORT;
    await waitForServer(host, port);
    log(`Server ready — starting DAP session on ${host}:${port}`);
    return new vscode.DebugAdapterInlineImplementation(new DAPProxy(host, port));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logDAP(dir: string, msg: any): void {
  if (msg.type === 'request') {
    log(`${dir} req  ${msg.command} #${msg.seq}`);
    if (msg.command === 'setBreakpoints') {
      const src = msg.arguments?.source;
      log(`     source path: ${src?.path ?? src?.name ?? '(none)'}`);
      for (const bp of (msg.arguments?.breakpoints ?? []))
        log(`     line ${bp.line}${bp.condition ? ` cond=${bp.condition}` : ''}`);
    }
  } else if (msg.type === 'response') {
    log(`${dir} resp ${msg.command} #${msg.request_seq} success=${msg.success}`);
    if (msg.command === 'setBreakpoints') {
      for (const bp of (msg.body?.breakpoints ?? []))
        log(`     id=${bp.id} verified=${bp.verified} line=${bp.line} source=${bp.source?.path ?? '(same)'}`);
    }
    if (msg.command === 'stackTrace') {
      for (const f of (msg.body?.stackFrames ?? []))
        log(`     frame ${f.id} ${f.source?.path ?? f.source?.name ?? '(no source)'}:${f.line}`);
    }
  } else if (msg.type === 'event') {
    if (msg.event === 'stopped') {
      const b   = msg.body ?? {};
      const ids = b.hitBreakpointIds?.join(',') ?? '(none)';
      log(`${dir} evt  stopped reason=${b.reason} thread=${b.threadId} hitIds=${ids}`);
    } else {
      log(`${dir} evt  ${msg.event}`);
    }
  }
}

export function activateDebug(context: vscode.ExtensionContext): void {
  out = vscode.window.createOutputChannel('BHL Debug');
  context.subscriptions.push(out);

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('bhl', new BHLDebugAdapterDescriptorFactory())
  );

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(session => {
      if (session.configuration.type !== 'bhl') return;
      out.show(true);
      log(`Session started: ${session.name}`);
      const bps = vscode.debug.breakpoints.filter(bp => bp.enabled);
      log(`Breakpoints at session start (${bps.length}): ${bps.map(fmtBp).join(', ') || '(none)'}`);
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(session => {
      if (session.configuration.type === 'bhl')
        log(`Session ended: ${session.name}`);
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidChangeBreakpoints(({ added, removed, changed }) => {
      for (const bp of added)   log(`Breakpoint added:   ${fmtBp(bp)}`);
      for (const bp of removed) log(`Breakpoint removed: ${fmtBp(bp)}`);
      for (const bp of changed) log(`Breakpoint changed: ${fmtBp(bp)}`);
    })
  );
}
