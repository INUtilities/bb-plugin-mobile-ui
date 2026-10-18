import assert from "node:assert/strict";
import { it } from "node:test";
import { usesPhoneShelf, writeSidebarChrome, clearSidebarChrome, readSidebarChrome } from "./sidebar-chrome.ts";

it("separates phone and desktop at the same narrow viewport without changing phone orientations", () => {
  for (const orientation of ["portrait", "landscape"] as const) {
    const phone = { device: "phone", orientation, viewport: "narrow", hitTarget: "large" } as const;
    const desktop = { ...phone, device: "desktop" } as const;
    assert.equal(usesPhoneShelf(phone), true);
    assert.equal(usesPhoneShelf(desktop), false);
  }
});

it("preserves a wide phone landscape without treating tablets as phones", () => {
  const phone = { device: "phone", orientation: "landscape", viewport: "medium", hitTarget: "large" } as const;
  assert.equal(usesPhoneShelf(phone), false);
  assert.equal(usesPhoneShelf({ ...phone, device: "tablet", viewport: "narrow" }), false);
});

it("publishes only the current chrome gates and removes them on disposal", () => {
  const attrs = new Set<string>();
  const doc = { documentElement: {
    toggleAttribute(name: string, on: boolean) { if (on) attrs.add(name); else attrs.delete(name); },
    removeAttribute(name: string) { attrs.delete(name); },
  } } as unknown as Document;
  const phone = { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" } as const;
  writeSidebarChrome(doc, phone);
  assert.deepEqual([...attrs], ["data-bb-sidebar-phone"]);
  assert.deepEqual(readSidebarChrome(doc), phone);
  writeSidebarChrome(doc, { ...phone, device: "desktop", viewport: "wide" });
  assert.equal(attrs.size, 0);
  clearSidebarChrome(doc);
  assert.equal(attrs.size, 0);
});
