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

console.log(res);
await client.disconnect();
```

### API

- `new Client(url: string, options?: { requestTimeoutMs?: number; backoff?: { initialDelayMs?: number; maxDelayMs?: number } })`
- `connect(): Promise<void>`
- `disconnect(code?: number, reason?: string): Promise<void>`
- `request<T = any>(request: { command: string; [key: string]: any }): Promise<T>`

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


