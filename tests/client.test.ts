import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { RpcClient } from "../src/rpc/client.ts";

test("correlates out-of-order responses and accepts null results", async () => {
  const rpc = new RpcClient({send: () => 1});
  const a = rpc.call("a"), b = rpc.call("b");
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":null}');
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":["file.js"]}');
  expect(await a).toEqual(["file.js"]); expect(await b).toBeNull();
});
test("remote errors and disconnect reject pending calls", async () => {
  const rpc = new RpcClient({send: () => -1});
  const a = rpc.call("a");
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"no"}}');
  await rejects(a, /no/);
  const b = rpc.call("b"); rpc.disconnect();
  await rejects(b, /disconnected/);
  await rejects(rpc.call("c"), /closed/);
});
test("send and serialization failures reject promises", async () => {
  await rejects(new RpcClient({send: () => 0}).call("a"), /dropped/);
  await rejects(new RpcClient({send: () => {throw new Error("failed");}}).call("a"), /failed/);
  await rejects(new RpcClient({send: () => 1}).call("a", 1n), TypeError);
});
test("malformed envelopes rejected; duplicate replies ignored", () => {
  const rpc = new RpcClient({send: () => 1});
  for (const input of ['oops', 'null', '{"jsonrpc":"2.0","id":1,"result":0,"error":{}}']) {
    expect(() => rpc.handleMessage(input)).toThrow();
  }
  expect(() => rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":0}')).not.toThrow();
});

test("timeout rejects unanswered requests, ignores late replies, and permits later calls", async () => {
  const rpc = new RpcClient({ send: () => 1 }, 10);
  await rejects(rpc.call("slow"), /timed out/);
  expect(() => rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":"late"}')).not.toThrow();
  const next = rpc.call("next");
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":"received"}');
  expect(await next).toBe("received");
  rpc.disconnect();
  rpc.disconnect();
});

test("timeouts are validated and duplicate replies do not affect other requests", async () => {
  for (const timeout of [0, -1, NaN, Infinity, 0.5, 2_147_483_648]) {
    expect(() => new RpcClient({ send: () => 1 }, timeout)).toThrow();
  }
  const rpc = new RpcClient({ send: () => 1 });
  const a = rpc.call("a"), b = rpc.call("b");
  const reply = '{"jsonrpc":"2.0","id":1,"result":false}';
  rpc.handleMessage(reply);
  rpc.handleMessage(reply);
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":0}');
  expect(await a).toBe(false);
  expect(await b).toBe(0);
});

test("transport accepts browser-style void send results", async () => {
  const rpc = new RpcClient({ send(_message: string): void {} });
  const result = rpc.call("read");
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":"ok"}');
  expect(await result).toBe("ok");
});
