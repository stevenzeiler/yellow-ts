import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client } from "../../src/Client";

// Mock websocket-ts to avoid network dependencies
vi.mock("websocket-ts", () => ({
  ExponentialBackoff: vi.fn().mockImplementation(() => ({})),
  WebsocketBuilder: vi.fn().mockImplementation(() => ({
    withBackoff: vi.fn().mockReturnThis(),
    onOpen: vi.fn().mockReturnThis(),
    onClose: vi.fn().mockReturnThis(),
    onMessage: vi.fn().mockReturnThis(),
    onError: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      close: vi.fn(),
      send: vi.fn(),
    }),
  })),
}));

// Mock nitrolite to avoid dependency
vi.mock("@erc7824/nitrolite", () => ({
  default: {
    parseRPCResponse: vi.fn((data) => ({ parsed: true, data: JSON.parse(data) })),
  },
}));

describe("Client listen method", () => {
  let client: Client;

  beforeEach(() => {
    client = new Client({ url: "ws://test" });
  });

  it("should register a listener for all messages", () => {
    const callback = vi.fn();
    const removeListener = client.listen(callback);

    expect(typeof removeListener).toBe("function");
    expect(callback).not.toHaveBeenCalled();

    // Simulate removing the listener
    removeListener();
  });

  it("should register a listener for specific events", () => {
    const callback = vi.fn();
    const removeListener = client.listen("testEvent", callback);

    expect(typeof removeListener).toBe("function");
    expect(callback).not.toHaveBeenCalled();

    // Simulate removing the listener
    removeListener();
  });

  it("should handle both parameter orders", () => {
    const callback = vi.fn();

    // Test listen(callback)
    const remove1 = client.listen(callback);
    expect(typeof remove1).toBe("function");
    remove1();

    // Test listen(event, callback)
    const remove2 = client.listen("event", callback);
    expect(typeof remove2).toBe("function");
    remove2();
  });

  it("should allow multiple listeners", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const remove1 = client.listen(callback1);
    const remove2 = client.listen("event", callback2);

    expect(typeof remove1).toBe("function");
    expect(typeof remove2).toBe("function");

    remove1();
    remove2();
  });
});

