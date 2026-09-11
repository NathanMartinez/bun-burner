import { expect, test, expectTypeOf } from "bun:test";
import { rejects } from "node:assert/strict";
import { RpcClient } from "../src/rpc/client.ts";
import { BitburnerClient, type FileMetadata } from "../src/bitburner/client.ts";

function fixture() {
  const sent: string[] = [];
  const rpc = new RpcClient({ send(message) { sent.push(message); return 1; } });
  return { rpc, api: new BitburnerClient(rpc), sent };
}

test("typed filename result validates the wire payload", async () => {
  const { rpc, api, sent } = fixture();
  const result = api.call("getFileNames", { server: "home" });
  expectTypeOf(result).toEqualTypeOf<Promise<string[]>>();
  expect(JSON.parse(sent[0]!)).toEqual({ jsonrpc: "2.0", id: 1, method: "getFileNames", params: { server: "home" } });
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":["a.js"]}');
  expect(await result).toEqual(["a.js"]);
  const invalid = api.call("getFileNames", { server: "home" });
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":[123]}');
  await rejects(invalid, /Invalid getFileNames/);
});

test("Bitburner string errors reject only the affected request", async () => {
  const { rpc, api } = fixture();
  const failed = api.call("getFile", { server: "home", filename: "missing.js" });
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"error":"File does not exist"}');
  await rejects(failed, /File does not exist/);
  const next = api.call("getFile", { server: "home", filename: "a.js" });
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":""}');
  expect(await next).toBe("");
});

test("metadata uses numeric timestamps from the 3.0.1 implementation", async () => {
  const { rpc, api } = fixture();
  const result = api.call("getFileMetadata", { server: "home", filename: "a.js" });
  expectTypeOf(result).toEqualTypeOf<Promise<FileMetadata>>();
  rpc.handleMessage('{"jsonrpc":"2.0","id":1,"result":{"filename":"a.js","atime":1,"btime":2,"mtime":3}}');
  expect((await result).mtime).toBe(3);
  const invalid = api.call("getFileMetadata", { server: "home", filename: "a.js" });
  rpc.handleMessage('{"jsonrpc":"2.0","id":2,"result":{"filename":"a.js","atime":"1","btime":2,"mtime":3}}');
  await rejects(invalid, /Invalid getFileMetadata/);
});

// Checked by tsc but never executed: prevent accidental widening of the API.
function typeChecks(api: BitburnerClient) {
  // @ts-expect-error Unknown methods are not part of the typed API.
  api.call("typo", {});
  // @ts-expect-error File reads require a filename.
  api.call("getFile", { server: "home" });
  // @ts-expect-error Filename listings require server parameters.
  api.call("getFileNames");
}
