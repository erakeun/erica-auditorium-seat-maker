# ERICA 컨퍼런스홀 중강당 3층 좌석배치 제작기

지정 제작 기준 406석을 행사별로 배정하고 JSON 파일로 저장·복원하는 독립 정적 웹앱입니다.

가운데 `L2 / C / R2`는 같은 행을 수평으로 맞추고, 양쪽 `L1 / R1`은 도면 판독 기준 약 45도로 꺾인 날개 형태로 배치했습니다. 이 각도와 전체 배치는 실측 도면이 아닙니다.

## 명단과 자동 배치

- `.xlsx`, `.csv`, 표 붙여넣기와 한 줄 이름 명단 지원
- 행사용 의전순위·내빈 영역·중앙 교차 배치와 수업용 무작위 배치
- 지정좌석, 좌석 고정, 미리보기, 부분 배치, 다시 섞기, 적용 취소·되돌리기
- 이름순·좌석순 `.xlsx`와 `.csv` 내보내기
- 참가자 명단과 자동 배치 설정을 포함한 JSON v2 저장, 기존 JSON v1 자동 변환

엑셀 파일은 브라우저 안에서만 처리합니다. 파서는 공식 배포판 `SheetJS CE 0.20.3`을 `dist/vendor`에 고정해 사용합니다.

사용자의 현장 확인을 기준으로 객석 뒤쪽 출입구는 **2개**이며, L2/C 및 C/R2 세로 통로 중심에 맞췄습니다. 각 양개문 한 세트가 출입구 하나입니다. 후면 벽에는 두 문 폭만큼 실제 개구부가 있고 N열 뒤 보행 공간을 유지합니다.

내부 벽 윤곽은 제공된 BMP의 왼쪽 ‘컨퍼런스홀 3층 평면도’를 시계방향 90° 회전해 참고했습니다. 무대 뒤 수평 벽 → 앞쪽 사선 → 양옆 직선 → 후면 사선 → 두 문이 있는 후면 벽의 순서를 기존 좌석 좌표에 맞춰 표현했습니다. 건물 부속실은 제외했으며, 정팔각형이나 좌석 bounding box가 아닙니다. 좌석 좌표를 변경하지 않았고 벽과 좌석의 최소 여유는 화면 좌표 기준 71.4입니다. **실측 CAD 복제나 실제 치수 표기가 아닌 406석 기준 개략 배치도**입니다.

## 현수막·LED 화면 연결

- 긴 **현수막**: [컨퍼런스홀 LED 현수막 제작기](https://erakeun.github.io/conference-hall-led-maker/)
- 별도의 **LED 화면**: 메뉴에서 [웰컴보드](https://erakeun.github.io/welcome-board-maker/) 또는 [안내문](https://erakeun.github.io/notice-maker/) 선택
- 모두 새 탭으로 열고 현재 배정·명단은 유지합니다. 행사명이나 참가자 정보를 URL에 전달하지 않습니다. 무대 바닥은 클릭 영역이 아닙니다.
- 현수막은 Enter, LED 메뉴는 Enter/Space로 열기, Escape로 닫기, 방향키로 메뉴 이동을 지원합니다. 드래그성 동작은 링크 실행에서 제외합니다.
- 인쇄에는 현수막과 LED의 공간 표현만 남기고 메뉴와 ‘만들기’ 안내는 숨깁니다.

2026-09-17에 세 주소의 HTTP 200과 실제 새 탭 열기를 확인했습니다. 현수막 저장소의 `app/page.tsx`와 `lib/template-config.js`에는 디자인별 `?template=` 처리가 있으나 별도의 강당 선택 템플릿은 없습니다. 전용 제작기 기본 주소를 사용해 저장된 디자인 선택을 임의로 덮어쓰지 않습니다. 연결된 제작기의 소스는 수정하지 않습니다.

## 로컬 실행

```sh
python3 -m http.server 4173 --directory dist
```

브라우저에서 `http://localhost:4173`을 엽니다. 별도 빌드나 외부 API는 필요하지 않습니다.

## 파일 구조

- `dist/seat-data.js`: 좌석 원본 데이터
- `dist/seat-layout.js`: 좌석 표시 좌표, 회전 외곽, 통로, 내부 벽 윤곽과 두 문 개구부
- `dist/stage-links.js`: 현수막 링크·LED 선택 메뉴, 키보드 및 드래그 오클릭 방지
- `dist/app.js`: 배정, 검색, 저장·복원, 확대·이동 기능
- `dist/roster-engine.js`: 명단 검증과 행사용·수업용 자동 배치 규칙
- `dist/roster-ui.js`: 파일 불러오기, 명단 확인, 배치 미리보기, 내보내기
- `dist/styles.css`: 화면 및 A3 가로 인쇄 스타일
- `dist/index.html`: 앱 화면

`main` 브랜치에 병합하면 GitHub Actions가 `dist` 폴더를 GitHub Pages로 게시합니다.

## 검증

```sh
node --check dist/seat-data.js
node --check dist/app.js
node --check dist/seat-layout.js
node --check dist/stage-links.js
node --check dist/roster-engine.js
node --check dist/roster-ui.js
node scripts/validate.cjs
node tests/roster-engine.test.cjs
node tests/seat-layout.test.cjs
```

검증 스크립트는 총 406석, 구역별 `60 / 82 / 126 / 79 / 59`, 좌석 ID 고유성과 외측 A~I열 범위를 확인합니다.
