import type { Device, HitTarget, Orientation, Viewport } from "./device.ts";

export type SidebarChrome = {
  device: Device;
  orientation: Orientation;
  viewport: Viewport;
  hitTarget: HitTarget;
};

export const SIDEBAR_CHROME_EVENT = "bb-sidebar-device-chrome";
export const DEFAULT_SIDEBAR_CHROME: SidebarChrome = {
  device: "desktop", orientation: "landscape", viewport: "wide", hitTarget: "small",
};
const chromeByDocument = new WeakMap<Document, SidebarChrome>();

export function usesPhoneShelf(chrome: SidebarChrome): boolean {
  return chrome.device === "phone" && chrome.viewport === "narrow";
}

export function readSidebarChrome(doc: Document): SidebarChrome {
  return chromeByDocument.get(doc) ?? DEFAULT_SIDEBAR_CHROME;
}

export function writeSidebarChrome(doc: Document, chrome: SidebarChrome): void {
  chromeByDocument.set(doc, chrome);
  const root = doc.documentElement;
  root?.toggleAttribute("data-bb-sidebar-phone", chrome.device === "phone");
}

export function clearSidebarChrome(doc: Document): void {
  chromeByDocument.delete(doc);
  doc.documentElement?.removeAttribute("data-bb-sidebar-phone");
}
