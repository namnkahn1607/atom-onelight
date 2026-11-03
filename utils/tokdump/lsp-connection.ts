/**
 * Minimal LSP client over stdio. Language-agnostic.
 *
 * Correctness points that matter (all of them were bugs in the old Python client):
 *  - Requests and server->client requests have SEPARATE id spaces. A message is a response
 *    only if it has no `method`; matching on `id` alone confuses a server request with ours.
 *  - Server->client requests are answered (workspace/configuration, registerCapability, ...);
 *    servers such as gopls block on them.
 *  - stderr is drained continuously (an unread pipe deadlocks the child at ~64 KB).
 *  - Framing is done on bytes: Content-Length counts bytes, not characters.
 *  - Shutdown is `shutdown` -> `exit`, with SIGKILL only as a last resort.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export class LspError extends Error {
    constructor(
        readonly code: number,
        message: string,
        readonly method: string
    ) {
        super(`LSP ${method}: [${code}] ${message}`);
    }
}

export interface ConnectionOptions {
    cmd: string[];
    cwd: string;
    /** Mirrors VSCode's settings tree; answers workspace/configuration. */
    settings?: unknown;
    workspaceFolders: { uri: string; name: string }[];
    requestTimeoutMs?: number;
}

interface Pending {
    method: string;
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
}

/** Walk a dotted section through nested objects, but prefer an exact flat key ("ui.semanticTokens"). */
export function lookupSetting(settings: unknown, section: string | undefined): unknown {
    if (!section) return settings ?? null;
    let cur: any = settings;
    const parts = section.split('.');
    for (let i = 0; i < parts.length && cur != null; i++) {
        const flat = parts.slice(i).join('.');
        if (typeof cur === 'object' && flat in cur) return cur[flat];
        cur = typeof cur === 'object' ? cur[parts[i]] : undefined;
    }
    return cur ?? null;
}

const NULL_REPLY = new Set([
    'client/registerCapability',
    'client/unregisterCapability',
    'window/workDoneProgress/create',
    'window/showMessageRequest',
    'workspace/semanticTokens/refresh',
    'workspace/diagnostic/refresh',
    'workspace/inlayHint/refresh',
    'workspace/codeLens/refresh',
]);

export class LspConnection {
    private proc: ChildProcessWithoutNullStreams;
    private buf: Buffer = Buffer.alloc(0);
    private nextId = 1;
    private pending = new Map<number, Pending>();
    private stderrTail = '';
    private dead: Error | undefined;
    private closed: Promise<void>;
    /** window/logMessage + showMessage payloads, for diagnostics on failure. */
    readonly serverLog: string[] = [];

    constructor(private opts: ConnectionOptions) {
        const [bin, ...args] = opts.cmd;
        this.proc = spawn(bin, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        this.closed = new Promise((resolve) => {
            this.proc.on('close', (code, signal) => {
                this.fail(new Error(`${bin} exited (code=${code}, signal=${signal}) before replying${this.tail()}`));
                resolve();
            });
        });
        this.proc.on('error', (e: NodeJS.ErrnoException) => {
            this.fail(new Error(e.code === 'ENOENT' ? `command not found: ${bin} (is it on PATH?)` : `spawn ${bin}: ${e.message}`));
        });
        this.proc.stdin.on('error', () => { }); // EPIPE after the child died: surfaced via `fail`
        this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
        this.proc.stderr.on('data', (chunk: Buffer) => {
            this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-16_384);
        });
    }

    private tail(): string {
        const log = this.serverLog.slice(-5).join('\n');
        return (this.stderrTail ? `\n[stderr tail]\n${this.stderrTail}` : '') + (log ? `\n[server log]\n${log}` : '');
    }

    private fail(err: Error): void {
        this.dead ??= err;
        for (const p of this.pending.values()) p.reject(this.dead);
        this.pending.clear();
    }

    private write(msg: object): void {
        const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
        this.proc.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]));
    }

    private onData(chunk: Buffer): void {
        this.buf = Buffer.concat([this.buf, chunk]);
        for (; ;) {
            const headerEnd = this.buf.indexOf('\r\n\r\n');
            if (headerEnd < 0) return;
            const m = /content-length:\s*(\d+)/i.exec(this.buf.subarray(0, headerEnd).toString('ascii'));
            if (!m) return this.fail(new Error('LSP frame without Content-Length header'));
            const start = headerEnd + 4;
            const len = Number(m[1]);
            if (this.buf.length < start + len) return;
            const body = this.buf.subarray(start, start + len).toString('utf8');
            this.buf = this.buf.subarray(start + len);
            try {
                this.dispatch(JSON.parse(body));
            } catch (e) {
                return this.fail(new Error(`bad LSP message: ${(e as Error).message}`));
            }
        }
    }

    private dispatch(msg: any): void {
        if (msg.method !== undefined) {
            if (msg.id !== undefined) this.onServerRequest(msg);
            else this.onNotification(msg);
            return;
        }
        const p = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new LspError(msg.error.code, String(msg.error.message), p.method));
        else p.resolve(msg.result);
    }

    private onNotification(msg: any): void {
        if (msg.method === 'window/logMessage' || msg.method === 'window/showMessage') {
            this.serverLog.push(String(msg.params?.message ?? ''));
            if (this.serverLog.length > 50) this.serverLog.shift();
        }
    }

    private onServerRequest(msg: any): void {
        if (msg.method === 'workspace/configuration') {
            const items: { section?: string }[] = msg.params?.items ?? [];
            return this.write({ id: msg.id, result: items.map((i) => lookupSetting(this.opts.settings, i.section)) });
        }
        if (msg.method === 'workspace/workspaceFolders') {
            return this.write({ id: msg.id, result: this.opts.workspaceFolders });
        }
        if (NULL_REPLY.has(msg.method)) return this.write({ id: msg.id, result: null });
        this.write({ id: msg.id, error: { code: -32601, message: `tokdump does not implement ${msg.method}` } });
    }

    request<T = unknown>(method: string, params: unknown, timeoutMs = this.opts.requestTimeoutMs ?? 30_000): Promise<T> {
        if (this.dead) return Promise.reject(this.dead);
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`timeout after ${timeoutMs}ms waiting for ${method}${this.tail()}`));
            }, timeoutMs);
            this.pending.set(id, {
                method,
                resolve: (v) => (clearTimeout(timer), resolve(v as T)),
                reject: (e) => (clearTimeout(timer), reject(e)),
            });
            this.write({ id, method, params });
        });
    }

    notify(method: string, params: unknown): void {
        if (!this.dead) this.write({ method, params });
    }

    async close(): Promise<void> {
        if (!this.dead) {
            try {
                await this.request('shutdown', null, 3_000);
                this.notify('exit', null);
            } catch {
                /* fall through to kill */
            }
        }
        const timer = setTimeout(() => this.proc.kill('SIGKILL'), 2_000);
        if (this.proc.exitCode === null && this.proc.signalCode === null) {
            this.proc.stdin.end();
            await this.closed;
        }
        clearTimeout(timer);
    }
}
