import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "../../src/Client";

const WS_URL = process.env.YELLOW_WS_URL || "ws://clearnet.yellow.com/ws";
const suite =
	(process.env.YELLOW_E2E === "1" ||
		process.env.YELLOW_E2E === "true" ||
		!!process.env.YELLOW_WS_URL)
		? describe
		: describe.skip;
// Default command; can be overridden via env: YELLOW_WS_COMMAND and YELLOW_WS_PARAMS (JSON)
const DEFAULT_COMMAND = "server_info";

function getCommand(): { command: string } & Record<string, any> {
	const envCommand = process.env.YELLOW_WS_COMMAND;
	const envParams = process.env.YELLOW_WS_PARAMS;
	let payload: any = { command: envCommand || DEFAULT_COMMAND };
	if (envParams) {
		try {
			const parsed = JSON.parse(envParams);
			payload = { ...payload, ...parsed };
		} catch {
			// ignore invalid JSON; use defaults
		}
	}
	return payload;
}

suite("Yellow clearnet acceptance", () => {
	let client: Client | null = null;

	beforeAll(async () => {
		client = new Client({
			url: WS_URL,
			requestTimeoutMs: 30_000,
			backoff: { initialDelayMs: 1_000, maxDelayMs: 15_000 },
		});
		await client.connect();
	});

	afterAll(async () => {
		if (client) {
			await client.disconnect();
			client = null;
		}
	});

	it("connects to Yellow clearnet websocket", async () => {
		expect(client).toBeTruthy();
	});

	it.skip("performs a simple request and receives a response", async () => {
		expect(client).toBeTruthy();
		const payload = getCommand();
		const response = await client!.request<any>(payload);
		// Basic shape assertions: must be an object and echo or contain data
		expect(typeof response).toBe("object");
		expect(response).not.toBeNull();
		// If JSON-RPC-style, response may include id and result fields
		// We can't assert strict structure without API docs, but ensure response isn't an error-like timeout
	});

	it.skip("supports multiple concurrent requests", async () => {
		expect(client).toBeTruthy();
		const payload = getCommand();
		const reqs = [client!.request<any>(payload), client!.request<any>(payload), client!.request<any>(payload)];
		const results = await Promise.all(reqs);
		expect(results.length).toBe(3);
	});
});


