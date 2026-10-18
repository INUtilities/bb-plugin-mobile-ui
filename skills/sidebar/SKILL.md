---
name: sidebar
description: Mobile UI의 폰 패널 모션·화면 효과·햅틱을 변경하거나 기존 Sidebar 설치를 점검할 때 사용한다.
---

# Mobile UI

표시 이름은 `Mobile UI`, 기존 설치 plugin id는 `sidebar`다. 실제 설치 소스는 `bb plugin source sidebar --json`으로 확인한다.

## 제품 계약과 경계

- `app.tsx`는 content script와 기기 브리지를 등록한다. desktop 카드 모듈이나 전역 테마를 등록하지 않는다.
- `lib/sidebar-depth.ts`는 phone 드로어·shelf 위치에 따른 화면 효과와 패널 조작 햅틱을 소유한다. 위치 추적·입력 이벤트 감시는 phone에서만 실행한다.
- `lib/sidebar-chrome.ts`는 기기 상태와 phone gate를 전달한다. narrow phone과 넓은 가로 화면의 기존 구분을 유지한다.
- 패널·탭 전환은 BB가 담당한다. 탭 스와이프 감지는 햅틱을 요청할 뿐 내비게이션을 대신하지 않는다.
- 저장된 배치·플레이스홀더와 활성 페인 강조는 이 플러그인의 범위 밖이다.

## 주의점

- GitHub 저장소 이름과 표시 이름을 바꿔도 기존 plugin id는 유지한다. `package.json`의 package name이 기존 설치 식별자와 연결되므로 `bb-plugin-sidebar`를 유지한다.
- 좁은 desktop 창은 phone이 아니다. kit에서 복사한 `lib/device.ts`, `lib/use-device.ts`는 원본을 따른다.
- native bridge의 `capabilities`에 `haptic`이 있을 때만 햅틱을 요청한다. 연타·취소·두 번째 손가락을 기존 동작과 구분한다.
- Browser native view와 Terminal WebGL을 보호하기 위해 오른쪽 패널이 열린 뒤에는 resting filter·transform을 유지하지 않는다.
- `openMode`·`desktopLayout` 등 예전 설정은 읽지 않는다.

## 확인과 적용

`npm test`, `npm run typecheck`, `bb plugin build .`를 실행한다. 변경 전 모바일 효과와 phone 가로·세로 화면을 비교하고 desktop·tablet의 스타일·위치 추적이 비활성인지 확인한다.

실제 적용 요청에서는 `bb plugin reload sidebar` 후 설치 경로와 실행 번들 해시를 확인한다. 비활성 플러그인을 임의로 켜지 않는다. phone native haptics와 native Browser·Terminal은 별도 검증 대상이다.

검증 커밋, 실행 번들, desktop·phone 캡처, 미확인을 보고하며 화면 완료는 사용자가 판단한다.
