# yellow-ts

TypeScript SDK for Yellow.com Clearnet that wraps `@erc7824/nitrolite` and uses `websocket-ts` for elegant backoff + reconnect, exposing an interface similar to `xrpl.js`.

**Status:** dormant since 2025-12 (first commit 2025-11-09, last 2025-12-05). Published on npm as `yellow-ts`, latest 0.0.10 (matches `package.json`, checked 2026-11-20). Examples that use it: [yellow-sdk-tutorials](https://github.com/stevenzeiler/yellow-sdk-tutorials).

- Works in Node.js and the browser
- Reconnects automatically with exponential backoff
- JSON-RPC-style `request` method with `id` correlation and timeouts

## Install

```bash
npm install yellow-ts
# peer deps are installed automatically as regular deps:
#   - websocket-ts
#   - @erc7824/nitrolite
```

## Usage (xrpl.js-like)

CommonJS:

```js
const { Client } = require("yellow-ts");

async function main() {
  // Defaults to wss://clearnet.yellow.com/ws if url is omitted
  const client = new Client({ url: "wss://clearnet.yellow.com/ws" })
  await client.connect();

  console.log("connected");
  await client.disconnect();
}

main();
```

ESM / TypeScript:

```js
import { Client } from "yellow-ts";
import { RPCMethod, RPCResponse } from "@erc7824/nitrolite";

const client = new Client({
  // url optional; defaults to wss://clearnet.yellow.com/ws
  url: "wss://clearnet.yellow.com/ws"
});

await client.connect();

console.log('Yellow Server connected');

// Listen for all messages with switch statement
client.listen(async (message: RPCResponse) => {
  switch (message.method) {
    case RPCMethod.AuthVerify:
      console.log('Auth Verify', message);
      // Handle authentication verification
      // Example: Send a transfer after authentication
      break;
      
    case RPCMethod.Assets:
      console.log('Assets', message.params);
      break;
      
    case RPCMethod.Error:
      console.log('Error', message.params);
      break;
      
    case RPCMethod.ChannelsUpdate:
      console.log('Channels Update', message.params);
      break;
      
    case RPCMethod.BalanceUpdate:
      console.log('Balance Update', message.params);
      break;
      
    default:
      console.log('Unknown message:', message);
      break;
  }
});

await client.disconnect();
```

## API

### WebSocket methods

- `new Client(options?: ClientOptions)` - Options include websocket URL, timeouts, backoff settings, and optional nitrolite configuration
- `connect(): Promise<void>`
- `disconnect(code?: number, reason?: string): Promise<void>`
- `request<T = any>(request: RequestObject): Promise<T>`
- `sendMessage(message: any): Promise<T | void>` - Send a raw message over websocket. If the message contains an `id` field, awaits and returns the response with the matching id.
- `listen(event?: string, callback: Function): () => void` - Listen for messages. Returns a function to remove the listener.

### Awaiting responses with `sendMessage`

When you send a message that includes a request `id`, `sendMessage` will automatically wait for the corresponding response and return it:

```typescript
import { Client } from "yellow-ts";
import { createGetConfigMessage, createEIP712AuthMessageSigner } from "@erc7824/nitrolite";

const client = new Client();
await client.connect();

// Create a signed message with a request ID
const requestId = 12345;
const message = createGetConfigMessage(signer, requestId);

// sendMessage detects the id and awaits the matching response
const response = await client.sendMessage(message);
console.log(response); // Response with id: 12345
```

If the message does not contain an `id` field, `sendMessage` sends the message without waiting for a response (fire-and-forget).

On disconnect, all in-flight requests are rejected. Reconnect is automatic via `websocket-ts`.

## Node and browser

This package targets both Node and browsers. It depends on `websocket-ts` under the hood for reconnection/backoff behavior.

## Types

Type definitions are included. The root exports `Client` and the types `ClientOptions`, `RequestObject`, `Json` and `RPCMethod`. Import everything else from `@erc7824/nitrolite` directly.

## Config

The SDK itself reads no environment variables. Options go to `new Client({...})`: `url` (default `wss://clearnet.yellow.com/ws`), `requestTimeoutMs`, `backoff: { initialDelayMs, maxDelayMs }` (defaults 1 s and 30 s), and an optional `nitrolite` config for on-chain methods. Only the acceptance tests read `YELLOW_E2E`, `YELLOW_WS_URL`, `YELLOW_WS_COMMAND` and `YELLOW_WS_PARAMS`.

## How it works

`src/Client.ts` opens a websocket with `websocket-ts` (exponential backoff reconnect). Outgoing messages that carry an `id` are tracked in a pending map and resolved when a reply with the same `id` arrives, or rejected on timeout or disconnect. Incoming messages are parsed and handed to `listen` callbacks. On-chain helpers (deposit, create, resize, close channels) delegate to a `NitroliteClient`.

## Develop

```bash
npm ci
npm test          # unit tests, plus the acceptance file (see below)
npx vitest run test/unit   # unit tests only, fully offline
npm run build     # tsup, outputs ESM, CJS and types to dist/
```

On 2026-11-20 the 4 unit tests passed and the build succeeded on Node 22. The acceptance tests were not run. Note: the acceptance file's `beforeAll` connects to the live websocket even when its tests are skipped, so `npm test` fails with "Connect timed out" on a machine that cannot reach Clearnet.

## Acceptance tests

These tests connect to a live Yellow clearnet websocket. By default they use `wss://clearnet.yellow.com/ws`. To run them, set `YELLOW_E2E=1` (or provide `YELLOW_WS_URL`). You can also override the command and params:

```bash
# Enable acceptance tests
export YELLOW_E2E=1

# Optional (override default URL)
export YELLOW_WS_URL="wss://clearnet.yellow.com/ws"

npm test
```

## License

MIT, see [LICENSE](LICENSE).

More: [docs/STATUS.md](docs/STATUS.md) for current state, [AGENTS.md](AGENTS.md) for agents.
