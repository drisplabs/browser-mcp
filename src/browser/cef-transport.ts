import { appendFileSync } from 'node:fs';
import type { ConnectionTransport } from 'puppeteer-core';

/** CEF native popup creation cannot suspend its renderer while the opener input
 * call is in flight. Keep auto-attachment, but never pause new renderer targets.
 * This transport is opt-in; ordinary Chrome connections retain Puppeteer defaults.
 */
function trace(direction: string, message: string): void {
  const file = process.env.DRISP_BROWSER_CEF_TRACE;
  if (file) appendFileSync(file, JSON.stringify({ direction, message: JSON.parse(message) }) + '\n');
}

export class CefTransport implements ConnectionTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;
  private constructor(private readonly socket: WebSocket) {
    socket.onmessage = event => { trace('received', String(event.data)); this.onmessage?.(String(event.data)); };
    socket.onclose = () => this.onclose?.();
  }

  static async connect(endpoint: string): Promise<CefTransport> {
    const url = new URL(endpoint);
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
      throw new Error('CEF compatibility connections must use loopback');
    }
    let websocket = endpoint;
    if (url.protocol === 'http:') {
      const response = await fetch(new URL('/json/version', url), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`CEF discovery failed: ${response.status}`);
      const value = await response.json() as { webSocketDebuggerUrl: string };
      websocket = value.webSocketDebuggerUrl;
    }
    const wsURL = new URL(websocket);
    if (wsURL.protocol !== 'ws:' || !['127.0.0.1', '[::1]', 'localhost'].includes(wsURL.hostname)) {
      throw new Error('CEF discovery returned a non-loopback WebSocket');
    }
    const socket = new WebSocket(websocket);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error('CEF WebSocket timed out')); }, 5000);
      socket.onopen = () => { clearTimeout(timeout); resolve(); };
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('CEF WebSocket failed')); };
    });
    return new CefTransport(socket);
  }

  send(message: string): void {
    const request = JSON.parse(message) as { method?: string; params?: Record<string, unknown> };
    if (request.method === 'Target.setAutoAttach' && request.params) {
      request.params.waitForDebuggerOnStart = false;
      const filter = (request.params.filter ?? [{}]) as Record<string, unknown>[];
      request.params.filter = [{ type: 'other', exclude: true }, ...filter];
      message = JSON.stringify(request);
    }
    trace('sent', message);
    this.socket.send(message);
  }

  close(): void { this.socket.close(); }
}
