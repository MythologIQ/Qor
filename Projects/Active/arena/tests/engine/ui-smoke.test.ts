import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

test("ui-smoke: screenshot file exists and is non-empty", () => {
  const screenshotPath = join(__dirname, "ui-smoke-screenshot.png");
  expect(existsSync(screenshotPath), "screenshot file should exist").toBe(true);
  const stat = readFileSync(screenshotPath);
  const kb = stat.length / 1024;
  expect(kb > 10, `screenshot should be >10KB, got ${kb.toFixed(1)}KB`).toBe(true);
});
