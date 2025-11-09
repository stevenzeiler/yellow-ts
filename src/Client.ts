import { ExponentialBackoff, Websocket, WebsocketBuilder } from "websocket-ts";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type RequestObject = {
	url?: string;
	command: string;
} & Record<string, Json>;

export type ClientOptions = {
	/**
	 * Optional websocket URL. Defaults to Yellow clearnet endpoint.
	 */
	url?: string;
	/**
	 * Request timeout in milliseconds.
	 * Individual request Promises will reject after this duration if no response arrives.
	 * Defaults to 30000 (30 seconds).
	 */
	requestTimeoutMs?: number;
	/**
	 * Exponential backoff settings for reconnects.
	 * Defaults: initial 1000ms, max 30000ms.
	 */
	backoff?: {
		initialDelayMs?: number;
		maxDelayMs?: number;
	};
};

type Pending = {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
	timer: ReturnType<typeof setTimeout> | null;
};

const DEFAULT_URL = "wss://clearnet.yellow.com/ws";

export class Client {
	private url: string;
	private options: {
		url: string;
		requestTimeoutMs: number;
		backoff: { initialDelayMs: number; maxDelayMs: number };
	};
	private ws: Websocket | null = null;
	private isConnecting = false;
	private isConnected = false;
	private nextId = 1;
	private pendingById: Map<number, Pending> = new Map();
	private builder: WebsocketBuilder;

	constructor(options?: ClientOptions) {
		this.url = options?.url ?? DEFAULT_URL;
		this.options = {
			url: this.url,
			requestTimeoutMs: options?.requestTimeoutMs ?? 30_000,
			backoff: {
				initialDelayMs: options?.backoff?.initialDelayMs ?? 1_000,
				maxDelayMs: options?.backoff?.maxDelayMs ?? 30_000,
			},
		};

		this.builder = new WebsocketBuilder(this.url)
			.withBackoff(
				new ExponentialBackoff(
					this.options.backoff.initialDelayMs,
					this.options.backoff.maxDelayMs
				)
			)
			.onOpen((ws: Websocket, ev: Event) => {
				this.ws = ws;
				this.isConnected = true;
			})
			.onClose((ws: Websocket, ev: CloseEvent) => {
				this.isConnected = false;
				this.ws = null;
				// Reject in-flight requests on disconnect
				for (const [id, pending] of this.pendingById.entries()) {
					pending.timer && clearTimeout(pending.timer);
					pending.reject(new Error("Disconnected"));
					this.pendingById.delete(id);
				}
			})
			.onMessage((ws: Websocket, ev: MessageEvent) => {
				this.handleMessage(ev.data);
			})
			.onError((ws: Websocket, ev: Event) => {
				// Let consumer handle by awaiting connect/request rejections
				// No-op here to avoid unhandled errors bubbling
				void ev;
			});
	}

	async connect(): Promise<void> {
		if (this.isConnected) return;
		if (this.isConnecting) {
			// Wait until open or timeout to avoid racing multiple connects
			await this.waitUntilOpen(this.options.requestTimeoutMs);
			return;
		}
		this.isConnecting = true;
		try {
			// Ensure WebSocket is available in Node by polyfilling with 'ws'
			if (typeof (globalThis as any).WebSocket === "undefined") {
				try {
					const wsMod = await import("ws");
					// Prefer named export WebSocket; fallback to default export for older versions
					(globalThis as any).WebSocket = (wsMod as any).WebSocket ?? (wsMod as any).default ?? (wsMod as any);
				} catch {
					// If polyfill fails, continue; browser environments should already provide WebSocket
				}
			}
			// build() returns a Websocket instance and immediately attempts connection
			this.ws = this.builder.build();
			await this.waitUntilOpen(this.options.requestTimeoutMs);
			this.isConnected = true;
		} finally {
			this.isConnecting = false;
		}
	}

	async disconnect(code?: number, reason?: string): Promise<void> {
		if (!this.ws) return;
		try {
			this.ws.close(code, reason);
		} finally {
			this.isConnected = false;
			this.ws = null;
		}
	}

	async request<T = any>(request: RequestObject): Promise<T> {
		if (!this.isConnected || !this.ws) {
			await this.connect();
		}
		const id = this.nextId++;
		const payload = { id, ...request };

		const result = new Promise<T>((resolve, reject) => {
			const timer =
				this.options.requestTimeoutMs > 0
					? setTimeout(() => {
							this.pendingById.delete(id);
							reject(new Error("Request timed out"));
						}, this.options.requestTimeoutMs)
					: null;
			this.pendingById.set(id, { resolve, reject, timer });
		});

		this.ws!.send(JSON.stringify(payload));
		return result;
	}

	private async waitUntilOpen(timeoutMs: number): Promise<void> {
		if (this.isConnected) return;
		const start = Date.now();
		while (!this.isConnected) {
			if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
				throw new Error("Connect timed out");
			}
			// Yield to event loop
			await new Promise((r) => setTimeout(r, 20));
		}
	}

	private handleMessage(data: any): void {
		let parsed: any = data;
		try {
			if (typeof data === "string") {
				parsed = JSON.parse(data);
			}
		} catch {
			// Non-JSON payloads are ignored for request/response flow
			return;
		}
		const id = parsed?.id;
		if (typeof id !== "number") return;
		const pending = this.pendingById.get(id);
		if (!pending) return;
		this.pendingById.delete(id);
		pending.timer && clearTimeout(pending.timer);
		if (parsed?.status === "error" || parsed?.error) {
			pending.reject(parsed);
		} else {
			pending.resolve(parsed);
		}
	}
}


