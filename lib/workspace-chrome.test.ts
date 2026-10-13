import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountWorkspaceChrome } from "./workspace-chrome.ts";
import { readNativeLayout, WORKSPACE_PREFERENCES_EVENT } from "./workspaces.ts";

function page() { return new JSDOM('<div data-app-content-shell></div><nav aria-label="Primary navigation"><button id="plugin">Issues</button></nav><div data-sidebar="sidebar"><a data-sidebar-thread-id="t" href="#">Thread</a></div>', { url: "https://bb.test/" }); }
function countPanes(value: ReturnType<typeof readNativeLayout>): number { if (!value) return 0; const walk=(n: typeof value.root): number=>n.type==="pane"?1:n.children.reduce((s,c)=>s+walk(c),0);return walk(value.root); }
const turn=()=>new Promise(resolve=>setTimeout(resolve,140));

test("mount creates one default tab and disposal removes chrome and history interception", () => {
 const dom=page(),doc=dom.window.document,push=dom.window.history.pushState;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:()=>{}});
 assert.equal(doc.querySelectorAll('[role="tab"]').length,1);
 assert.equal(doc.querySelector('[role="tab"]')?.textContent,"기본");
 assert.equal(doc.querySelector<HTMLButtonElement>('[data-workspace-close]')?.disabled,true);
 stop();assert.equal(doc.querySelector('[data-sidebar-workspaces]'),null);assert.equal(dom.window.history.pushState,push);dom.window.close();
});
test("left ribbon navigation follows new-pane and replace preferences using native snapshots", async () => {
 const dom=page(),doc=dom.window.document,navigations:string[]=[];
 let stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLButtonElement>('#plugin')?.click();dom.window.history.pushState(null,"","/plugins/issues/tasks/all");await turn();
 assert.deepEqual(navigations,["/plugins/issues/tasks/all"]);
 assert.equal(countPanes(readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"))),1);
 stop();stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLAnchorElement>('a')?.click();dom.window.history.pushState(null,"","/projects/p/threads/t");await turn();
 assert.equal(countPanes(readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"))),2);
 stop();stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:r=>navigations.push(r)});
 dom.window.dispatchEvent(new dom.window.CustomEvent(WORKSPACE_PREFERENCES_EVENT,{detail:{pluginId:"sidebar",openMode:"replace"}}));
 doc.querySelector<HTMLButtonElement>('#plugin')?.click();dom.window.history.pushState(null,"","/plugins/vault/docs/main");await turn();
 const layout=readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"));
 assert.equal(countPanes(layout),2);assert.equal(navigations.at(-1),"/plugins/vault/docs/main");
 assert.ok(JSON.stringify(layout).includes('"pluginId":"vault"'));stop();dom.window.close();
});
test("new workspace is empty and the old workspace restores after a client remount", () => {
 const dom=page(),doc=dom.window.document,navigations:string[]=[];
 dom.window.history.replaceState(null,"","/plugins/issues/tasks/all");
 let stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLButtonElement>('[aria-label="새 워크스페이스"]')?.click();assert.equal(navigations.at(-1),"/");
 stop();dom.reconfigure({url:"https://bb.test/"});stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",navigate:r=>navigations.push(r)});
 const original=Array.from(doc.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(b=>b.textContent==="기본");original?.click();
 assert.equal(navigations.at(-1),"/plugins/issues/tasks/all");stop();dom.window.close();
});
