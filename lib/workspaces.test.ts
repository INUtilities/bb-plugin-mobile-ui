import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWorkspaces, addWorkspace, closeWorkspace, saveWorkspace, selectWorkspace, decodeWorkspaces, readNativeLayout, normalizeOpenMode, contentForRoute } from "./workspaces.ts";
const snapshot = { route: "/", layout: null, maximizedPaneId: null };
const chat = { kind: "thread", projectId: "proj_one", threadId: "thr_one" } as const;
const page = { kind: "plugin-panel", pluginId: "issues", panelPath: "tasks", subPath: "all" } as const;

test("starts with one default workspace and refuses to close the final tab", () => {
  const state = createWorkspaces(snapshot);
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].name, "기본");
  assert.equal(closeWorkspace(state, state.activeId), state);
});
test("new workspace is empty and switching restores the exact saved layout", () => {
  const base = createWorkspaces(snapshot);
  const opened = {route:"/projects/proj_one/threads/thr_one",maximizedPaneId:null,layout:{
    root:{type:"split" as const,dir:"row" as const,sizes:[0.35,0.65],children:[
      {type:"pane" as const,paneId:"p1",content:chat},
      {type:"pane" as const,paneId:"p2",content:page},
    ]},focusedPaneId:"p1",
  }};
  const saved = saveWorkspace(base, opened);
  const added = addWorkspace(saved, "second");
  assert.equal(added.tabs[1].snapshot.layout, null);
  const restored = selectWorkspace(added, base.activeId);
  assert.deepEqual(restored.tabs.find(t => t.id === restored.activeId)?.snapshot, opened);
  assert.equal(closeWorkspace(added, "second").activeId, base.activeId);
});
test("native layout and persisted workspace reject invalid focus, sizes, and external routes", () => {
  assert.equal(readNativeLayout('{"version":99,"layout":{}}'), null);
  assert.equal(readNativeLayout('{"version":1,"layout":{"root":{"type":"pane","paneId":"p1","content":{"kind":"new-thread"}},"focusedPaneId":"missing"}}'), null);
  assert.equal(decodeWorkspaces('{"version":1,"activeId":"x","tabs":[]}', snapshot).tabs.length, 1);
  const s=createWorkspaces(snapshot);s.tabs[0].snapshot.route="https://example.com";
  assert.equal(decodeWorkspaces(JSON.stringify(s), snapshot).tabs[0].snapshot.route, "/");
});
test("settings choose a new pane by default and only replace is an alternate value", () => {
  assert.equal(normalizeOpenMode(undefined), "new-pane");
  assert.equal(normalizeOpenMode("replace"), "replace");
  assert.equal(normalizeOpenMode("unexpected"), "new-pane");
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  assert.doesNotMatch(server,/DESKTOP_LAYOUT_SETTING|desktopLayout/);
  assert.match(server,/experimental_optionLabels/);
});
test("route mapping covers thread-list and ribbon plugin page targets", () => {
  assert.deepEqual(contentForRoute("/projects/proj_one/threads/thr_one"), chat);
  assert.deepEqual(contentForRoute("/plugins/issues/tasks/all"),page);
  assert.equal(contentForRoute("/settings"),null);
  assert.equal(contentForRoute("//example.com"),null);
});
