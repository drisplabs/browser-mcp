import net from 'node:net';
import { appendFileSync } from 'node:fs';
import type { ConnectionTransport } from 'puppeteer-core';

interface Tab {
  id: string;
  url: string;
  title: string;
}
interface Target {
  tabID: string;
  targetID: string;
}
interface TargetInfo {
  targetId: string;
  browserContextId?: string;
  [key: string]: unknown;
}
interface Message {
  id?: number;
  method?: string;
  params?: {
    targetInfo?: TargetInfo;
    targetId?: string;
    sessionId?: string;
    [key: string]: unknown;
  };
  sessionId?: string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** App-owned lifecycle client. The credential is resolved by the app, not a Thread selector. */
export class DesktopClient {
  constructor(
    readonly socketPath: string,
    private readonly credential: string
  ) {}
  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      let buffer = '';
      let settled = false;
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(value as T);
      };
      socket.setTimeout(8000, () => finish(new Error('Desktop request timed out')));
      socket.on('error', () => finish(new Error('Desktop unavailable')));
      socket.on('end', () => finish(new Error('Desktop disconnected')));
      socket.on('connect', () =>
        socket.write(
          JSON.stringify({ ...params, version: 1, method, credential: this.credential }) + '\n'
        )
      );
      socket.on('data', (data) => {
        buffer += data.toString();
        if (buffer.length > 1048576) return finish(new Error('Desktop response too large'));
        const end = buffer.indexOf('\n');
        if (end < 0) return;
        try {
          const response = JSON.parse(buffer.slice(0, end)) as { error?: string; result?: T };
          if (response.error) finish(new Error(`Desktop ${response.error}`));
          else finish(undefined, response.result as T);
        } catch {
          finish(new Error('Invalid desktop response'));
        }
      });
    });
  }
}

/** A Puppeteer transport with app-owned discovery/lifecycle. Never requests
 * global discovery or root auto-attachment; popups are adopted on the next sync,
 * after their opener's input call has settled. Ordinary Chrome is untouched.
 * Development-only until Hub authorization and the per-tool gate are wired.
 */
export class DesktopTransport implements ConnectionTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;
  private sequence = -1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private targets = new Map<string, { tab: Tab; info: TargetInfo }>();
  private sessions = new Map<string, string>();
  private discovered = false;
  private attaching = false;
  private refreshPromise?: Promise<void>;

  private constructor(
    private socket: WebSocket,
    readonly client: DesktopClient
  ) {
    socket.onmessage = (event) => this.receive(JSON.parse(String(event.data)) as Message);
    socket.onclose = () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error('Desktop CDP disconnected'));
      }
      this.pending.clear();
      this.onclose?.();
    };
  }

  static async connect(client: DesktopClient, endpoint: string): Promise<DesktopTransport> {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
      throw new Error('Desktop CDP must use IPv4 loopback');
    // Authenticate before contacting CDP. No discovery fallback is permitted.
    await client.request('list');
    const version = await fetch(new URL('/json/version', url), {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!version.ok) throw new Error('Desktop CDP unavailable');
    const info = (await version.json()) as { webSocketDebuggerUrl: string };
    const wsURL = new URL(info.webSocketDebuggerUrl);
    if (wsURL.protocol !== 'ws:' || wsURL.hostname !== '127.0.0.1' || wsURL.port !== url.port)
      throw new Error('Invalid desktop CDP endpoint');
    const socket = new WebSocket(wsURL);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('Desktop CDP timed out'));
      }, 5000);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Desktop CDP unavailable'));
      };
    });
    const transport = new DesktopTransport(socket, client);
    try {
      await transport.refresh();
      return transport;
    } catch (error) {
      transport.close();
      throw error;
    }
  }

  tabID(targetID: string): string | undefined {
    return this.targets.get(targetID)?.tab.id;
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshTargets().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async refreshTargets(): Promise<void> {
    const snapshot = await this.client.request<{ tabs: Tab[] }>('list');
    const live = new Set(snapshot.tabs.map((tab) => tab.id));
    for (const [id, value] of this.targets) {
      if (!live.has(value.tab.id)) {
        this.targets.delete(id);
        for (const [sessionID, rootID] of this.sessions) {
          if (rootID === id) this.sessions.delete(sessionID);
        }
        this.emit({ method: 'Target.targetDestroyed', params: { targetId: id } });
      }
    }
    for (const tab of snapshot.tabs) {
      if ([...this.targets.values()].some((value) => value.tab.id === tab.id)) continue;
      const target = await this.client.request<Target>('target', { tabID: tab.id });
      const result = (await this.command('Target.getTargetInfo', {
        targetId: target.targetID,
      })) as { targetInfo: TargetInfo };
      const info = { ...result.targetInfo };
      delete info.browserContextId; // One synthetic context represents this bound Thread only.
      this.targets.set(target.targetID, { tab, info });
      if (this.discovered)
        this.emit({ method: 'Target.targetCreated', params: { targetInfo: info } });
      if (this.attaching) await this.attach(target.targetID);
    }
  }

  private async attach(targetId: string): Promise<void> {
    if ([...this.sessions.values()].includes(targetId)) return;
    await this.command('Target.attachToTarget', { targetId, flatten: true });
  }

  private trace(direction: string, message: Message): void {
    const file = process.env.DRISP_BROWSER_CEF_TRACE;
    if (file)
      appendFileSync(
        file,
        JSON.stringify({ direction, message }, (key: string, value: unknown) =>
          key === 'data' ? '[binary data]' : value
        ) + '\n'
      );
  }

  private emit(message: Message): void {
    this.onmessage?.(JSON.stringify(message));
  }
  private command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.sequence--;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Desktop CDP ${method} timed out`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  private receive(message: Message): void {
    this.trace('received', message);
    if (message.id !== undefined && message.id < 0) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      }
      return;
    }
    if (message.method === 'Target.attachedToTarget') {
      const info = message.params?.targetInfo;
      const sessionID = message.params?.sessionId;
      if (!info || !sessionID) return;
      if (!message.sessionId && !this.targets.has(info.targetId)) return;
      const rootID = message.sessionId ? this.sessions.get(message.sessionId) : info.targetId;
      if (!rootID || !this.targets.has(rootID)) return;
      this.sessions.set(sessionID, rootID);
      delete info.browserContextId;
    }
    if (message.method === 'Target.targetInfoChanged') {
      const info = message.params?.targetInfo;
      if (!info || !this.targets.has(info.targetId)) return;
      delete info.browserContextId;
    }
    if (message.method === 'Target.detachedFromTarget')
      this.sessions.delete(message.params?.sessionId ?? '');
    this.emit(message);
  }

  send(raw: string): void {
    const request = JSON.parse(raw) as Message;
    this.trace('sent', request);
    void this.route(request).catch(() =>
      this.emit({
        id: request.id,
        sessionId: request.sessionId,
        error: { code: -32000, message: 'Desktop operation unavailable' },
      })
    );
  }

  private async route(request: Message): Promise<void> {
    const reply = (result: unknown) =>
      this.emit({ id: request.id, sessionId: request.sessionId, result });
    const params = request.params ?? {};
    if (request.sessionId) {
      if (!this.sessions.has(request.sessionId)) throw new Error('Unknown session');
      // Page auto-attachment is for that page's frames only; never pause a renderer.
      if (request.method === 'Target.setAutoAttach') params.waitForDebuggerOnStart = false;
      this.socket.send(JSON.stringify(request));
      return;
    }
    switch (request.method) {
      case 'Target.getBrowserContexts':
        reply({ browserContextIds: [] });
        return;
      case 'Target.setDiscoverTargets':
        this.discovered = Boolean(params.discover);
        if (this.discovered)
          for (const { info } of this.targets.values())
            this.emit({ method: 'Target.targetCreated', params: { targetInfo: info } });
        reply({});
        return;
      case 'Target.setAutoAttach':
        this.attaching = Boolean(params.autoAttach);
        if (this.attaching) for (const id of this.targets.keys()) await this.attach(id);
        reply({});
        return;
      case 'Target.getTargets':
        reply({ targetInfos: [...this.targets.values()].map((value) => value.info) });
        return;
      case 'Target.createTarget': {
        const target = await this.client.request<Target>('create', { url: params.url });
        await this.refresh();
        reply({ targetId: target.targetID });
        return;
      }
      case 'Target.activateTarget':
      case 'Target.closeTarget': {
        const tabID = this.tabID(params.targetId ?? '');
        if (!tabID) throw new Error('Unknown target');
        await this.client.request(request.method === 'Target.closeTarget' ? 'close' : 'select', {
          tabID,
        });
        reply(request.method === 'Target.closeTarget' ? { success: true } : {});
        return;
      }
      case 'Target.attachToTarget':
      case 'Target.getTargetInfo':
        if (!this.targets.has(params.targetId ?? '')) throw new Error('Unknown target');
        break;
      case 'Target.detachFromTarget':
        if (!this.sessions.has(params.sessionId ?? '')) throw new Error('Unknown session');
        break;
      case 'Browser.getVersion':
        break;
      default:
        throw new Error('Unsupported desktop browser operation');
    }
    this.socket.send(JSON.stringify(request));
  }

  close(): void {
    this.socket.close();
  }
}
