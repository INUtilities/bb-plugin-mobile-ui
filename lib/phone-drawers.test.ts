import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import { injectPhoneDrawers, PHONE_DRAWER_SELECTOR } from "./phone-drawers.ts";
import { SIDEBAR_CHROME_EVENT, writeSidebarChrome } from "./sidebar-chrome.ts";

const phone = { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" } as const;

it("includes shared native drawers and preserves Chat UI's own sheets and unrelated overlays", () => {
  const dom = new JSDOM(`<div id="menu" data-persistent-drawer-content></div>
    <div id="plugin" data-persistent-drawer-content data-bb-plugin="example"></div>
    <div id="composer" data-persistent-drawer-content data-bb-plugin="bb--composer"></div>
    <div data-persistent-drawer-content data-bb-chat-ui-model-menu></div>
    <div data-persistent-drawer-content data-bb-chat-ui-pr-menu></div>
    <div data-persistent-drawer-content data-bb-chat-ui-option-menu></div>
    <div data-persistent-drawer-content><div aria-label="Prompt actions"></div></div>
    <div role="dialog"></div><div data-vaul-drawer-direction="left"></div>
    <div data-testid="secondary-panel-shelf"></div><div data-bb-chat-ui-card></div>`);
  const doc = dom.window.document;
  doc.documentElement.setAttribute("data-bb-chat-ui-root-device", "phone");
  assert.deepEqual([...doc.querySelectorAll(PHONE_DRAWER_SELECTOR)].map(n => n.id), ["menu", "plugin"]);
  doc.documentElement.removeAttribute("data-bb-chat-ui-root-device");
  assert.equal(doc.querySelectorAll(PHONE_DRAWER_SELECTOR).length, 7);
  dom.window.close();
});

it("follows device changes in both orientations and disposes without changing native DOM or styles", () => {
  const dom = new JSDOM(`<div data-persistent-drawer-content data-state="open" role="dialog"
    style="bottom: 280px; transform: translate3d(0, 35px, 0); transition: none">
    <div data-persistent-drawer-handle><div></div></div><input value="draft">
  </div>`);
  const doc = dom.window.document;
  const original = doc.body.innerHTML;
  const dispose = injectPhoneDrawers(doc);
  assert.equal(doc.querySelector("#bb-mobile-phone-drawers"), null);
  const change = (device: "phone" | "desktop" | "tablet", orientation: "portrait" | "landscape" = "portrait") => {
    writeSidebarChrome(doc, { ...phone, device, orientation });
    dom.window.dispatchEvent(new dom.window.Event(SIDEBAR_CHROME_EVENT));
  };
  change("phone");
  assert.ok(doc.querySelector("#bb-mobile-phone-drawers"));
  change("phone", "landscape");
  assert.equal(doc.querySelectorAll("#bb-mobile-phone-drawers").length, 1);
  change("tablet");
  assert.equal(doc.querySelector("#bb-mobile-phone-drawers"), null);
  change("desktop");
  assert.equal(doc.querySelector("#bb-mobile-phone-drawers"), null);
  change("phone");
  dispose();
  dispose();
  change("phone");
  assert.equal(doc.querySelector("#bb-mobile-phone-drawers"), null);
  assert.equal(doc.body.innerHTML, original);
  dom.window.close();
});

it("sends one native impact on primary handle press, with phone, ownership and repeat guards", () => {
  const dom = new JSDOM(`<div data-persistent-drawer-content data-state="open">
    <div data-persistent-drawer-handle><div id="grab"></div></div><button id="content">item</button>
  </div>`);
  const doc = dom.window.document;
  const messages: unknown[] = [];
  const native = { capabilities: ["haptic"], post: (message: unknown) => messages.push(message) };
  Object.assign(dom.window, { bb: { native } });
  let now = 0;
  Object.defineProperty(dom.window.performance, "now", { value: () => now });
  writeSidebarChrome(doc, phone);
  const dispose = injectPhoneDrawers(doc);
  const press = (selector = "#grab", primary = true) => {
    const event = new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, cancelable: true });
    Object.defineProperty(event, "isPrimary", { value: primary });
    doc.querySelector(selector)!.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  };
  press("#content");
  press("#grab", false);
  assert.equal(messages.length, 0);
  press();
  press();
  assert.deepEqual(messages, [{ type: "haptic", kind: "impact-light" }]);
  now = 400;
  press();
  assert.equal(messages.length, 2);
  now = 800;
  doc.documentElement.setAttribute("data-bb-chat-ui-root-device", "phone");
  doc.querySelector("[data-persistent-drawer-content]")!.setAttribute("data-bb-plugin", "bb--composer");
  press();
  assert.equal(messages.length, 2);
  doc.documentElement.removeAttribute("data-bb-chat-ui-root-device");
  native.capabilities = [];
  press();
  assert.equal(messages.length, 2);
  native.capabilities = ["haptic"];
  writeSidebarChrome(doc, { ...phone, device: "desktop" });
  press();
  assert.equal(messages.length, 2);
  writeSidebarChrome(doc, phone);
  doc.querySelector("[data-persistent-drawer-content]")!.setAttribute("data-state", "closed");
  press();
  assert.equal(messages.length, 2);
  dispose();
  doc.querySelector("[data-persistent-drawer-content]")!.setAttribute("data-state", "open");
  press();
  assert.equal(messages.length, 2);
  dom.window.close();
});
