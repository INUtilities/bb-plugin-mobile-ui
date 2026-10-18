import { useEffect } from "react";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { injectSidebarDepth } from "./lib/sidebar-depth";
import { SIDEBAR_CHROME_EVENT, writeSidebarChrome } from "./lib/sidebar-chrome";
import { useDeviceChrome } from "./lib/use-device";

function MobileUiBridge() {
  const chrome = useDeviceChrome();
  useEffect(() => {
    writeSidebarChrome(document, chrome);
    window.dispatchEvent(new Event(SIDEBAR_CHROME_EVENT));
  }, [chrome.device, chrome.orientation, chrome.viewport, chrome.hitTarget]);
  return null;
}
export default definePluginApp((app) => {
  app.contentScripts.register({ id: "sidebar-depth", mount: (context) => injectSidebarDepth(document, { pluginId: context.pluginId }) });
  app.slots.experimental_appOverlay({ id: "sidebar-chrome", component: MobileUiBridge });
});
