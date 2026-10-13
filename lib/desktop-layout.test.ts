import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("removed desktop card setting cannot override the new shell", () => {
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  const app=readFileSync(new URL("../app.tsx",import.meta.url),"utf8");
  const depth=readFileSync(new URL("./sidebar-depth.ts",import.meta.url),"utf8");
  assert.doesNotMatch(server,/desktopLayout|DESKTOP_LAYOUT_SETTING/);
  assert.doesNotMatch(app,/DESKTOP_LAYOUT_EVENT|desktop-layout/);
  assert.match(depth,/chrome.device === "phone" \? sidebarDepthCss\(false, chrome\) : ""/);
  assert.doesNotMatch(depth,/fetchDesktopLayoutEnabled|readDesktopLayoutEnabled/);
});
