import { expect, test } from "bun:test";
import { readConfig } from "../src/config.ts";

test("configuration has usable defaults and accepts explicit settings", () => {
  expect(readConfig({})).toEqual({ hostname: "127.0.0.1", port: 12525 });
  expect(readConfig({ BUN_BURNER_HOST: "localhost", BUN_BURNER_PORT: "12526" })).toEqual({ hostname: "localhost", port: 12526 });
});

test("invalid ports and URL-shaped hosts fail before listening", () => {
  for (const port of ["", "0", "65536", "1.5", "123abc", "-1", " 12525"]) {
    expect(() => readConfig({ BUN_BURNER_PORT: port })).toThrow("BUN_BURNER_PORT");
  }
  for (const host of ["", " ", "ws://localhost", "localhost/path"]) {
    expect(() => readConfig({ BUN_BURNER_HOST: host })).toThrow("BUN_BURNER_HOST");
  }
});
