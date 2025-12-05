import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "../../src/Client";
import { RPCMethod, SignatureParamFragment, createAuthRequestMessage, createAuthVerifyMessage, createEIP712AuthMessageSigner, createGetConfigMessage } from "@erc7824/nitrolite";
import { generatePrivateKey } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";

const WS_URL = process.env.YELLOW_WS_URL || "wss://clearnet.yellow.com/ws";
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

describe("Yellow clearnet acceptance", () => {
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

	it("can register and unregister listeners", async () => {
		expect(client).toBeTruthy();

		let receivedMessages: any[] = [];
		const callback = (message: any) => {
			receivedMessages.push(message);
		};

		// Test registering a listener
		const removeListener = client!.listen(callback);
		expect(typeof removeListener).toBe("function");

		// Test that we can call listen with event filter
		const removeListener2 = client!.listen(RPCMethod.GetChannels, callback);
		expect(typeof removeListener2).toBe("function");

		// Test removing listeners
		removeListener();
		removeListener2();

		// Listeners should be removed (though we can't easily test this without sending messages)
		expect(receivedMessages.length).toBe(0);
	});

	it("sendMessage awaits and returns reply for messages with request id", async () => {
		expect(client).toBeTruthy();

		// generate random signer account using viem
		const privateKey = generatePrivateKey();
		const signer = createWalletClient({
			account: privateKey,
			chain: base,
			transport: http()
		});

		const requestId = 12345;

		const sessionKey = generatePrivateKey();
		const session = createWalletClient({
			account: sessionKey,
			chain: base,
			transport: http()
		});

		const sessionExpireTimestamp = String(Math.floor(Date.now() / 1000) + 3600);

		const authParams = {
			address: signer.account.address,
			session_key: session.account.address,
			application: 'Test app',
			allowances: [{
				asset: 'usdc',
				amount: '0.01',
			}],
			expires_at: BigInt(sessionExpireTimestamp),
			scope: 'test.app',
        };

        const eip712Signer = createEIP712AuthMessageSigner(signer, authParams, { name: "Test App" });
		const getConfigMessage = await createAuthRequestMessage(authParams, requestId);
 
		// sendMessage should send the message and await the reply with matching id
		const response = await client!.sendMessage(getConfigMessage);
		// Verify we got a response
		expect(response).toBeTruthy();
		expect(typeof response).toBe("object");

		expect(response.requestId).toBe(requestId);
		expect(response.method).toBe(RPCMethod.AuthChallenge);
		expect(response.params.challengeMessage).toBeDefined();
		// The response should have the same id as the request
		//expect((response as any).id).toBe(message.id);
	});
});


