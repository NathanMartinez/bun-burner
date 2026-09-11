import { expect, test, expectTypeOf } from "bun:test";
import { deepStrictEqual, rejects } from "node:assert/strict";
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

test("remaining Remote API methods validate results and omit absent params", async () => {
  const cases: { args: import("../src/bitburner/types.ts").RemoteCall; result: unknown; invalid: unknown }[] = [
    { args: ["pushFile", { server: "home", filename: "a.tsx", content: "const a = <div />;" }], result: "OK", invalid: "ok" },
    { args: ["deleteFile", { server: "home", filename: "a.tsx" }], result: "OK", invalid: true },
    { args: ["getAllFiles", { server: "home" }], result: [{ filename: "a.tsx", content: "const a = <div />;" }], invalid: [{ filename: "a.tsx", content: 2 }] },
    { args: ["getAllFileMetadata", { server: "home" }], result: [{ filename: "a.tsx", atime: 1, btime: 2, mtime: 3 }], invalid: [{ filename: "a.tsx", atime: "1", btime: 2, mtime: 3 }] },
    { args: ["calculateRam", { server: "home", filename: "a.tsx" }], result: 1.6, invalid: "1.6" },
    { args: ["getDefinitionFile"], result: "interface NS {}", invalid: {} },
    { args: ["getSaveFile"], result: { identifier: "fixture", binary: true, save: "abc" }, invalid: { identifier: "fixture", binary: "true", save: "abc" } },
    { args: ["getAllServers"], result: [{ hostname: "home", hasAdminRights: true, purchasedByPlayer: false }], invalid: [{ hostname: "home", hasAdminRights: true }] },
  ];
  for (const { args, result, invalid } of cases) {
    const { rpc, api, sent } = fixture();
    const response = api.call(...args);
    const request = JSON.parse(sent[0]!);
    expect(request.method).toBe(args[0]);
    if (args.length === 1) expect(Object.hasOwn(request, "params")).toBe(false);
    else expect(request.params).toEqual(args[1]);
    rpc.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    deepStrictEqual(await response, result);
    const bad = api.call(...args);
    rpc.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: 2, result: invalid }));
    await rejects(bad, /Invalid .* result/);
  }
});

function completeApiTypeChecks(api: BitburnerClient) {
  expectTypeOf(api.call("pushFile", { server: "home", filename: "a.ts", content: "" })).toEqualTypeOf<Promise<"OK">>();
  expectTypeOf(api.call("getDefinitionFile")).toEqualTypeOf<Promise<string>>();
  expectTypeOf(api.call("getAllServers")).toEqualTypeOf<Promise<import("../src/bitburner/types.ts").ServerInfo[]>>();
  // @ts-expect-error Parameterless methods do not accept parameter objects.
  api.call("getDefinitionFile", {});
  // @ts-expect-error Writes require content.
  api.call("pushFile", { server: "home", filename: "a.ts" });
  const uncertainMethod = Math.random() ? "getFile" : "pushFile";
  // @ts-expect-error A union including pushFile still requires its content parameter.
  api.call(uncertainMethod, { server: "home", filename: "a.ts" });
}
