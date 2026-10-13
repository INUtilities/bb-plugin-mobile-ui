import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { WORKSPACE_OPEN_MODE_SETTING, WORKSPACE_PREFERENCES_CHANNEL, normalizeOpenMode } from "./lib/workspaces";

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    [WORKSPACE_OPEN_MODE_SETTING]: {
      type: "select",
      label: "스레드·플러그인 페이지를 열 때",
      description: "왼쪽 리본 메뉴와 스레드 목록에서 연 화면을 새 페인에 추가하거나 현재 활성 페인의 화면을 교체합니다.",
      options: ["new-pane", "replace"],
      experimental_optionLabels: { "new-pane": "새 페인에 열기", replace: "현재 활성 페인의 화면 교체" },
      default: "new-pane",
    },
  });
  settings.onChange((next) => bb.realtime.publish(WORKSPACE_PREFERENCES_CHANNEL, { openMode: normalizeOpenMode(next.openMode) }));
}
