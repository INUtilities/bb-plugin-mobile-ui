import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sidebarDepthCss, syncSidebarDepth } from "./sidebar-depth.ts";
import { writeSidebarChrome } from "./sidebar-chrome.ts";

describe("Mobile UI scope", () => {
  it("uses the mobile name without publishing a global desktop theme", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.bb.name, "Mobile UI");
    assert.equal(pkg.name, "bb-plugin-sidebar");
    assert.equal(pkg.bb.themes, undefined);
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(app, /mountSidebarCards|sidebar-cards/);
  });

  it("leaves desktop and tablet styles empty at every viewport size", () => {
    for (const device of ["desktop", "tablet"] as const) {
      for (const viewport of ["narrow", "medium", "wide"] as const) {
        assert.equal(sidebarDepthCss({ device, viewport, orientation: "landscape", hitTarget: "large" }), "");
      }
    }
  });

  it("does not read geometry or change the chat on desktop or tablet", () => {
    for (const device of ["desktop", "tablet"] as const) {
      const doc = {
        querySelector() { assert.fail("must not read the desktop or tablet DOM"); },
        querySelectorAll() { assert.fail("must not sample desktop or tablet geometry"); },
      } as unknown as Document;
      writeSidebarChrome(doc, { device, viewport: "narrow", orientation: "portrait", hitTarget: "large" });
      assert.equal(syncSidebarDepth(doc), 0);
    }
  });

  it("keeps phone drawer and shelf effects without desktop card rules", () => {
    const css = sidebarDepthCss({ device: "phone", viewport: "narrow", orientation: "portrait", hitTarget: "large" });
    assert.match(css, /secondary-panel-shelf/);
    assert.match(css, /--bb-motion-chat-dim/);
    assert.match(css, /prefers-reduced-motion/);
    assert.doesNotMatch(css, /desktop-card|offcanvas|right-phase|backdrop-filter|sidebar-resize-handle/);
  });
});
