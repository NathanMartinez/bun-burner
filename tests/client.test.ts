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
