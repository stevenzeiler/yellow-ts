import { ExponentialBackoff, Websocket, WebsocketBuilder } from "websocket-ts";
import {
	NitroliteClient,
	RPCMethod,
	parseRPCResponse,
	type CreateChannelParams,
	type CheckpointChannelParams,
	type ChallengeChannelParams,
	type ResizeChannelParams,
	type CloseChannelParams,
	type ChannelId,
	type State,
	type Hash,
	type AccountInfo,
	type NitroliteClientConfig
} from "@erc7824/nitrolite";

import * as nitrolite from "@erc7824/nitrolite";

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
	/**
	 * Optional nitrolite client configuration for blockchain operations.
	 * If provided, enables all nitrolite methods (deposit, createChannel, etc.).
	 */
	nitrolite?: NitroliteClientConfig;
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
	private pendingById: Map<number | string, Pending> = new Map();
	private listeners: Array<{ event?: string; callback: Function }> = [];
	private nitroliteClient?: NitroliteClient;
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
		} as any; // Cast to any to allow nitrolite property

		// Store nitrolite config separately
		(this.options as any).nitrolite = options?.nitrolite;

		// Initialize nitrolite client if configuration is provided
		if (options?.nitrolite) {
			this.nitroliteClient = new NitroliteClient(options.nitrolite);
		}

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

	/**
	 * Listen for messages from the websocket.
	 * @param event Optional event name to filter messages. If not provided, receives all messages.
	 * @param callback Function to call when a message is received.
	 * @returns A function to remove the listener.
	 */

	listen(eventOrCallback: RPCMethod | Function | undefined, callback?: Function): () => void {

		let event: string | undefined;
		let cb: Function;

		if (typeof eventOrCallback === 'function') {
			cb = eventOrCallback;
		} else {

			event = eventOrCallback;
			cb = callback!;
		}

		const listener = { event, callback: cb };
		this.listeners.push(listener);

		// Return a function to remove this listener
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	// ========== Nitrolite Methods ==========

	// ========== Deposit Methods ==========

	/**
	 * Deposits tokens or ETH into the custody contract. Automatically handles ERC-20 approval if necessary.
	 * This is the first step in the channel lifecycle, as funds must be deposited before channels can be created.
	 * Funds deposited are held in a custody contract until they are allocated to channels or withdrawn.
	 * @param amount The amount to deposit
	 * @returns Promise resolving to transaction hash
	 */
	async deposit(amount: bigint): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.deposit(amount);
	}

	/**
	 * Manually approves the custody contract to spend the specified ERC-20 amount.
	 * While the deposit method handles approvals automatically, this method gives developers explicit control over token approvals.
	 * This is useful for implementing custom approval UX flows or for batching transactions with other operations.
	 * @param amount The amount to approve
	 * @returns Promise resolving to transaction hash
	 */
	async approveTokens(amount: bigint): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.approveTokens(amount);
	}

	/**
	 * Gets the current allowance granted to the custody contract for the specified ERC20 token.
	 * This is useful for implementing proper UX around approvals, checking if a user needs to approve tokens before depositing,
	 * or verifying if existing approvals are sufficient for planned operations.
	 * @returns Promise resolving to the allowance amount
	 */
	async getTokenAllowance(): Promise<bigint> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.getTokenAllowance();
	}

	/**
	 * Gets the on-chain balance of the specified ERC-20 token for the connected wallet address.
	 * This helps developers implement UX that shows users their available token balance before depositing,
	 * ensuring they have sufficient funds for the operation. It's particularly useful for validating input amounts in deposit forms.
	 * @returns Promise resolving to the token balance
	 */
	async getTokenBalance(): Promise<bigint> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.getTokenBalance();
	}

	// ========== Channel Creation Methods ==========

	/**
	 * Creates a new state channel on-chain. This is a critical step in the Nitrolite workflow that establishes a secure payment channel
	 * between two participants. The method handles the complex process of constructing the initial state with proper allocations,
	 * signing it, and submitting the transaction to the custody contract. Developers use this to enable high-throughput, low-latency applications
	 * with instant payments between participants.
	 * @param params Channel creation parameters
	 * @returns Promise resolving to channel ID, initial state, and transaction hash
	 */
	async createChannel(params: CreateChannelParams): Promise<{ channelId: ChannelId; initialState: State; txHash: Hash }> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.createChannel(params);
	}

	/**
	 * Combines deposit and channel creation into a single operation, optimizing the user experience by reducing the steps required.
	 * This is ideal for applications where users start from scratch without existing deposits. It handles the entire initialization flow:
	 * token approval (if needed), depositing funds to the custody contract, and creating the channel. This creates a smoother onboarding process for users
	 * who want to start using your application immediately.
	 * @param depositAmount The amount to deposit
	 * @param params Channel creation parameters
	 * @returns Promise resolving to channel info and transaction hashes
	 */
	async depositAndCreateChannel(
		depositAmount: bigint,
		params: CreateChannelParams
	): Promise<{ channelId: ChannelId; initialState: State; depositTxHash: Hash; createChannelTxHash: Hash }> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.depositAndCreateChannel(depositAmount, params);
	}

	// ========== Channel Operation Methods ==========

	/**
	 * Checkpoints a channel state on-chain, creating a permanent on-chain record of the latest state.
	 * This is essential for security and dispute resolution, as it provides an immutable record that both parties have agreed to the current channel state.
	 * Use this method periodically during long-running channels to minimize risk, before large allocation changes, or when a participant will be offline for extended periods.
	 * @param params Checkpoint parameters
	 * @returns Promise resolving to transaction hash
	 */
	async checkpointChannel(params: CheckpointChannelParams): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.checkpointChannel(params);
	}

	/**
	 * Initiates a challenge for a channel when the counterparty becomes unresponsive or refuses to cooperate.
	 * This is a dispute resolution mechanism that allows a participant to force progress in the channel by submitting their latest signed state.
	 * After challenge, the counterparty has a time window (challengeDuration) to respond with a later state, or the challenger's state will be considered final.
	 * This method protects users from losing funds due to counterparty unavailability.
	 * @param params Challenge parameters
	 * @returns Promise resolving to transaction hash
	 */
	async challengeChannel(params: ChallengeChannelParams): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.challengeChannel(params);
	}

	/**
	 * Adjusts the total funds allocated to a channel using a new agreed state. This is crucial for dynamic applications where funding requirements change over time.
	 * Use this to add more funds to a channel that's running low (top-up), or to reduce the locked funds when less capacity is needed.
	 * Resizing requires consensus from both participants and results in an on-chain transaction that updates the channel's total capacity.
	 * @param params Resize parameters
	 * @returns Promise resolving to transaction hash
	 */
	async resizeChannel(params: ResizeChannelParams): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.resizeChannel(params);
	}

	// ========== Channel Closing Methods ==========

	/**
	 * Gracefully closes a channel on-chain using a mutually agreed final state. This is the standard way to end a channel when both participants are cooperative.
	 * The method submits the final state to the blockchain, which unlocks funds according to the agreed allocations and makes them available for withdrawal.
	 * This method should be your go-to approach for ending channels in normal circumstances, as it's gas-efficient and immediately settles the final balances.
	 * @param params Close channel parameters
	 * @returns Promise resolving to transaction hash
	 */
	async closeChannel(params: CloseChannelParams): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.closeChannel(params);
	}

	// ========== Withdrawal Methods ==========

	/**
	 * Withdraws tokens previously deposited into the custody contract back to the user's wallet.
	 * This allows users to reclaim their funds after channels have been closed. This method only affects available (unlocked) funds -
	 * it cannot withdraw tokens that are still locked in active channels. Use this as the final step in the channel lifecycle to complete
	 * the full deposit-use-withdraw flow and return funds to the user's control.
	 * @param amount The amount to withdraw
	 * @returns Promise resolving to transaction hash
	 */
	async withdrawal(amount: bigint): Promise<Hash> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.withdrawal(amount);
	}

	// ========== Account Information Methods ==========

	/**
	 * Retrieves a list of all channel IDs associated with the connected account.
	 * This is essential for applications that need to monitor, display, or manage multiple channels simultaneously.
	 * Use this to build dashboards showing all user channels, to implement batch operations on multiple channels, or to verify channel existence before performing operations.
	 * @returns Promise resolving to array of channel IDs
	 */
	async getAccountChannels(): Promise<ChannelId[]> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.getAccountChannels();
	}

	/**
	 * Provides a comprehensive view of the account's financial state within the Nitrolite system.
	 * Returns information about available (unlocked) funds, funds locked in active channels, and the total number of channels.
	 * This method is crucial for building UIs that show users their current balances and channel activity, for validating that sufficient funds are available before operations,
	 * and for monitoring the overall health of the user's Nitrolite account.
	 * @returns Promise resolving to account information
	 */
	async getAccountInfo(): Promise<AccountInfo> {
		if (!this.nitroliteClient) {
			throw new Error("Nitrolite client not configured. Provide nitrolite config in ClientOptions.");
		}
		return this.nitroliteClient.getAccountInfo();
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

	/**
	 * Send a raw message over the websocket connection.
	 * If the message contains an `id` field, this method will wait for a response
	 * with the matching id and return it. Otherwise, it sends without waiting.
	 * @param message The message to send (will be JSON.stringify'd if not a string)
	 * @returns Promise resolving to the response if message has an id, or void otherwise
	 */
	async sendMessage<T = any>(message: any): Promise<T | void> {
		if (!this.isConnected || !this.ws) {
			await this.connect();
		}
		// Check if message has an id field for request/response correlation
		const messageObj = typeof message === 'string' ? JSON.parse(message) : message;
		const id = messageObj?.req[0];

		if (typeof id === 'number' || typeof id === 'string') {
			// Track this request and wait for corresponding response
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

			const data = typeof message === 'string' ? message : JSON.stringify(message);
			this.ws!.send(data);
			return result;
		}

		// No id field - just send without waiting for response
		const data = typeof message === 'string' ? message : JSON.stringify(message);
		this.ws!.send(data);
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
		var response: any;
		var parsedRpcMethod: any;
		try {

			response = (nitrolite as any).parseAnyRPCResponse(data);
			if (typeof data === "string") {
				parsed = JSON.parse(data);
			}
		} catch(error) {
			console.error("Error parsing message", data);
			console.error("Error", error);
			// Non-JSON payloads are ignored for request/response flow
			return;
		}

		// Handle request/response correlation
		const id = response.requestId

		if (typeof id === "number" || typeof id === "string") {
			const pending = this.pendingById.get(id);
			if (pending) {
				this.pendingById.delete(id);
				pending.timer && clearTimeout(pending.timer);
				if (parsed?.status === "error" || parsed?.error) {
					pending.reject(response);
				} else {
					pending.resolve(response);
				}
			}
		}

		// Parse with nitrolite and call listeners
		try {

			// Call listeners
			for (const listener of this.listeners) {
				try {
					if (!listener.event || (parsedRpcMethod as any)?.type === listener.event || (parsedRpcMethod as any)?.event === listener.event) {
						listener.callback(response);
					}
				} catch (error) {
					// Don't let listener errors break other listeners
					console.warn('Listener error:', error);
				}
			}
		} catch (parseError) {
			// If parsing fails, still try to call listeners with raw parsed data
			for (const listener of this.listeners) {
				try {
					if (!listener.event) {
						const response = (nitrolite as any).parseAnyRPCResponse(JSON.stringify(parsed));
						listener.callback(response);
					}
				} catch (error) {
					console.warn('Listener error:', error);
				}
			}
		}
	}
}
