# Sidebar

상단 워크스페이스 탭에 열린 페인과 배치를 묶는 BB 플러그인이다. 왼쪽 리본 메뉴와 스레드 목록은 BB가 제공하는 것을 그대로 사용한다.

## 동작

- 처음에는 `기본` 탭 하나가 있다. `＋`는 비어 있는 워크스페이스를 추가한다.
- 각 워크스페이스는 화면 경로, BB의 네이티브 페인 트리, 분할 크기, 활성 페인과 최대화 상태를 기억한다.
- 마지막 워크스페이스는 닫을 수 없다. 페인을 닫는 것과 워크스페이스를 닫는 것은 별개다.
- 왼쪽 리본 메뉴와 스레드 목록에서 화면을 열면 `openMode`에 따라 새 페인에 추가하거나 활성 페인의 내용을 교체한다.
- 좌우 사이드바는 공통 셸이다. 워크스페이스별 별도 도구 목록을 만들지 않는다.
- 데스크톱은 사이드바와 각 페인 사이를 여백과 둥근 모서리로 구분한다. 이전 `desktopLayout` 토글은 제거했다.
- 기존 phone 드로어·shelf 모션과 햅틱은 유지한다. 기기 판정 원본인 `lib/device.ts`, `lib/use-device.ts`는 수정하지 않는다.

## 설정

설정의 Sidebar에서 「스레드·플러그인 페이지를 열 때」를 선택한다.

| 값 | 화면 표시 | 기본값 |
| --- | --- | --- |
| `new-pane` | 새 페인에 열기 | 기본 |
| `replace` | 현재 활성 페인의 화면 교체 | — |

CLI에서도 바꿀 수 있다.

```sh
bb plugin config sidebar set openMode new-pane
bb plugin config sidebar set openMode replace
```

## 복원 경계

현재 BB SDK에는 전체 페인 배치를 복원하는 공개 API가 없다. 이 구현은 BB 소스에서 확인한 `bb.splitLayout`의 version 1 세션 저장 형식을 사용하며, 저장소가 지원하는 범위에서 화면을 다시 불러와 복원한다. BB 앱 소스나 설치 파일은 수정하지 않는다.

워크스페이스 전환과 왼쪽 메뉴의 화면 열기는 앱 화면 재초기화를 수반한다. 서버의 에이전트 실행은 중단하지 않는다. 워크스페이스 목록은 창의 `sessionStorage`에 두므로 같은 창의 재로드에서는 유지되고 새 앱 세션에서는 기본 탭으로 시작한다. 플러그인 내부의 메모리 상태와 네이티브 Browser·Terminal 뷰를 그대로 마운트해 유지하는 것은 보장하지 않는다.

BB의 최대 8개 페인 제한을 따른다. 새 페인 모드에서 한도를 넘기면 기존 페인을 임의로 교체하지 않고 안내한다. 손상된 저장값은 기본 워크스페이스로 되돌린다.

## 확인

```sh
npm test
npm run typecheck
bb plugin build .
bb plugin reload sidebar
```

화면의 최종 판정은 사용자가 한다. `bb plugin list --json`의 설치 경로와 번들 해시를 함께 확인한다.

## 설치

```sh
bb plugin install path:/Users/kebab/Foundry/bb-plugin/bb-plugin-sidebar --yes
```

plugin id는 `sidebar`다. `plugin:sidebar:chat-canvas`는 별도로 선택할 수 있는 채팅·사이드바 테마다. 다른 BB 테마의 팔레트를 덮어쓰지 않는다.

## 라이선스

MIT. [LICENSE](LICENSE).
