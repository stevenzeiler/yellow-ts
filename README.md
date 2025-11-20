## yellow-ts - Yellow.com Clearnet SDK for Typescript

TypeScript SDK for Yellow.com Clearnet that wraps `@erc7824/nitrolite` and uses `websocket-ts` for elegant backoff + reconnect, exposing an interface similar to `xrpl.js`.

- Works in Node.js and the browser
- Reconnects automatically with exponential backoff
- JSON-RPC-style `request` method with `id` correlation and timeouts

### Install

```bash
npm install yellow-ts
# peer deps are installed automatically as regular deps:
#   - websocket-ts
#   - @erc7824/nitrolite
```

### Usage (xrpl.js-like)

CommonJS:

```js
const { Client } = require("yellow-ts");

async function main() {
  // Defaults to wss://clearnet.yellow.com/ws if url is omitted
  const client = new Client({ url: "wss://clearnet.yellow.com/ws" })
  await client.connect();

  console.log(response);
  await client.disconnect();
}

main();
```

ESM / TypeScript:

```ts
import { Client } from "yellow-ts";

const client = new Client({
  // url optional; defaults to wss://clearnet.yellow.com/ws
  url: "wss://clearnet.yellow.com/ws",
  requestTimeoutMs: 30_000,
  backoff: { initialDelayMs: 1000, maxDelayMs: 30_000 }
});

await client.connect();

// Make a request
const res = await client.request({ command: "server_info" });
console.log(res);

// Send a raw message (fire and forget)
await client.sendMessage({ type: "ping" });

// Listen for all messages
const removeListener = client.listen((message) => {
  console.log("📨 Received:", message);
});

// Listen for specific event types (if supported by the server)
const removeFilteredListener = client.listen("ledger", (message) => {
  console.log("📊 Ledger update:", message);
});

// Later, remove listeners
removeListener();
removeFilteredListener();

await client.disconnect();
```

### Nitrolite State Channels Example

```ts
import { Client } from "yellow-ts";

// Initialize client with nitrolite configuration
const client = new Client({
  url: "wss://clearnet.yellow.com/ws",
  nitrolite: {
    publicClient,
    walletClient,
    addresses: { custody, adjudicator, guestAddress, tokenAddress },
    chainId: 137,
    challengeDuration: 100n
  }
});

await client.connect();

// 1. Deposit funds
const depositTxHash = await client.deposit(1000000n);

// 2. Create a channel
const { channelId, initialState } = await client.createChannel({
  initialAllocationAmounts: [700000n, 300000n], // [host amount, guest amount]
  stateData: '0x1234' // Application-specific data
});

// 3. Get account info
const accountInfo = await client.getAccountInfo();
console.log(`Available: ${accountInfo.available}, Locked: ${accountInfo.locked}`);

// 4. Later, close the channel
const closeTxHash = await client.closeChannel({
  finalState: {
    channelId,
    stateData: '0x5678',
    allocations: finalAllocations,
    version: 5n,
    serverSignature: signature
  }
});

// 5. Withdraw funds
const withdrawTxHash = await client.withdrawal(800000n);

await client.disconnect();
```

### API

#### WebSocket Methods

- `new Client(options?: ClientOptions)` - Options include websocket URL, timeouts, backoff settings, and optional nitrolite configuration
- `connect(): Promise<void>`
- `disconnect(code?: number, reason?: string): Promise<void>`
- `request<T = any>(request: RequestObject): Promise<T>`
- `sendMessage(message: any): Promise<void>` - Send a raw message over websocket (no response expected)
- `listen(event?: string, callback: Function): () => void` - Listen for messages. Returns a function to remove the listener.

#### Nitrolite Methods (State Channels)

When `nitrolite` configuration is provided in ClientOptions, all nitrolite blockchain methods become available:

**Deposit Methods:**
- `deposit(amount: bigint): Promise<Hash>` - Deposit tokens into custody contract
- `approveTokens(amount: bigint): Promise<Hash>` - Approve token spending
- `getTokenAllowance(): Promise<bigint>` - Get current token allowance
- `getTokenBalance(): Promise<bigint>` - Get token balance

**Channel Creation:**
- `createChannel(params: CreateChannelParams): Promise<{ channelId: ChannelId; initialState: State; txHash: Hash }>`
- `depositAndCreateChannel(depositAmount: bigint, params: CreateChannelParams): Promise<{ channelId: ChannelId; initialState: State; depositTxHash: Hash; createChannelTxHash: Hash }>`

**Channel Operations:**
- `checkpointChannel(params: CheckpointChannelParams): Promise<Hash>` - Checkpoint channel state
- `challengeChannel(params: ChallengeChannelParams): Promise<Hash>` - Challenge unresponsive counterparty
- `resizeChannel(params: ResizeChannelParams): Promise<Hash>` - Resize channel funds

**Channel Closing:**
- `closeChannel(params: CloseChannelParams): Promise<Hash>` - Close channel gracefully

**Withdrawal:**
- `withdrawal(amount: bigint): Promise<Hash>` - Withdraw funds from custody

**Account Information:**
- `getAccountChannels(): Promise<ChannelId[]>` - Get user's channel IDs
- `getAccountInfo(): Promise<AccountInfo>` - Get comprehensive account info

On disconnect, all in-flight requests are rejected. Reconnect is automatic via `websocket-ts`.

### Node and Browser

This package targets both Node and browsers. It depends on `websocket-ts` under the hood for reconnection/backoff behavior.

### Types

Type definitions are included. `@erc7824/nitrolite` is also re-exported from the root as `nitrolite`.

### Build

```bash
npm run build
```

### Acceptance tests

These tests connect to a live Yellow clearnet websocket. By default they use `wss://clearnet.yellow.com/ws`. To run them, set `YELLOW_E2E=1` (or provide `YELLOW_WS_URL`). You can also override the command and params:

```bash
# Enable acceptance tests
export YELLOW_E2E=1

# Optional (override default URL)
export YELLOW_WS_URL="wss://clearnet.yellow.com/ws"

# Optional (defaults to server_info)
export YELLOW_WS_COMMAND="server_info"
export YELLOW_WS_PARAMS='{}' # JSON string

npm test
```

### License

MIT


