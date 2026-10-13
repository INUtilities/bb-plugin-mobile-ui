import { useEffect } from "react";
import { definePluginApp, experimental_ProviderIcon as ProviderIcon, experimental_usePluginId, experimental_useProviders, useComposers, useRealtime, useSettings } from "@get-bb/plugin-sdk/app";
import { injectSidebarDepth } from "./lib/sidebar-depth";
import { SIDEBAR_CHROME_EVENT, writeSidebarChrome } from "./lib/sidebar-chrome";
import { useDeviceChrome } from "./lib/use-device";
import { mountWorkspaceChrome } from "./lib/workspace-chrome";
import { normalizeOpenMode, WORKSPACE_OPEN_MODE_SETTING, WORKSPACE_PREFERENCES_CHANNEL, WORKSPACE_PREFERENCES_EVENT } from "./lib/workspaces";

function PaneDragThreadProviders() {
  const composers = useComposers();
  const { providers } = experimental_useProviders();
  const threads = new Map<string, string>();
  for (const composer of composers) {
    if (composer.scope.kind === "thread" && composer.selection?.providerId) threads.set(composer.scope.threadId, composer.selection.providerId);
  }
  return <div hidden aria-hidden="true" data-sidebar-thread-providers="">
    {Array.from(threads, ([threadId, providerId]) => <span key={threadId} data-sidebar-thread-provider={threadId}>
      <ProviderIcon providerKind="agent" provider={providers.find(provider => provider.id === providerId) ?? { id: providerId }} aria-hidden={true} />
    </span>)}
  </div>;
}

function WorkspaceBridge() {
  const chrome = useDeviceChrome();
  const pluginId = experimental_usePluginId();
  const { values, isLoading } = useSettings();
  const publish = (openMode: unknown) => window.dispatchEvent(new CustomEvent(WORKSPACE_PREFERENCES_EVENT, { detail: { pluginId, openMode: normalizeOpenMode(openMode) } }));
  useEffect(() => {
    writeSidebarChrome(document, chrome);
    window.dispatchEvent(new Event(SIDEBAR_CHROME_EVENT));
  }, [chrome.device, chrome.orientation, chrome.viewport, chrome.hitTarget]);
  useEffect(() => mountWorkspaceChrome(document, { pluginId, device: chrome.device }), [pluginId, chrome.device]);
  useRealtime(WORKSPACE_PREFERENCES_CHANNEL, (payload) => {
    if (payload !== null && typeof payload === "object") publish(Reflect.get(payload, "openMode"));
  });
  useEffect(() => { if (!isLoading) publish(values?.[WORKSPACE_OPEN_MODE_SETTING]); }, [isLoading, values?.[WORKSPACE_OPEN_MODE_SETTING], pluginId, chrome.device]);
  return chrome.device === "desktop" ? <PaneDragThreadProviders /> : null;
}

export default definePluginApp((app) => {
  app.contentScripts.register({ id: "sidebar-depth", mount: (context) => injectSidebarDepth(document, { pluginId: context.pluginId }) });
  app.slots.experimental_appOverlay({ id: "workspace-preferences", component: WorkspaceBridge });
});
