# Mobile UI

폰에서 BB의 좌우 패널 모션과 조작 햅틱을 제공하는 플러그인이다.

- 왼쪽 드로어와 오른쪽 shelf가 움직일 때 위치에 맞춰 화면 효과를 적용한다.
- 패널을 열면 채팅 화면의 모서리·그림자·음영을 조정한다.
- 패널 열기·닫기와 스와이프 확정 시 native bridge로 햅틱을 요청한다. 취소된 동작과 중복 입력은 구분한다.
- 오른쪽 패널의 탭·추가·닫기·이전/다음 버튼, 탭 스와이프, 실행 메뉴와 파일 선택에 햅틱을 더한다. 실제 탭 전환은 BB가 담당한다.
- 왼쪽 패널이 열리면 작성창 포커스를 해제한다.
- 동작 줄이기 설정을 존중한다. 햅틱은 native bridge가 지원하는 폰 앱에서만 동작한다.

데스크톱 카드·리사이즈 꾸밈·활성 페인 강조와 전역 Chat canvas 테마는 제공하지 않는다. desktop·tablet에서는 스타일과 위치 추적을 실행하지 않는다. phone의 기존 narrow 화면 효과와 넓은 가로 화면의 구분은 유지한다.

## 이름과 업데이트

표시 이름은 `Mobile UI`이며 GitHub 저장소 이름은 `bb-plugin-mobile-ui`다. 기존 설치 식별자를 유지하기 위해 package name은 `bb-plugin-sidebar`, plugin id는 `sidebar`로 둔다. 로컬 설치 폴더 이름도 유지할 수 있다.

저장소 이름을 바꿔도 다른 기기의 Git remote와 설치 경로는 자동으로 바뀌지 않는다. path 설치는 해당 경로의 코드·빌드·reload를 따로 갱신해야 한다.

## 개발과 적용

```sh
npm install
npm test
npm run typecheck
bb plugin build .
bb plugin reload sidebar
```

실제 설치 소스는 `bb plugin source sidebar --json`으로 확인한다. 기기 판정 복사본은 kit 원본을 따른다. 최종 화면은 사용자가 판단하며 검증 커밋·실행 번들·phone 및 desktop 캡처·미확인 범위를 함께 보고한다.
