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

사용자의 현장 확인을 기준으로 객석 뒤쪽 출입구는 **2개**이며, L2/C 및 C/R2 세로 통로 중심에 맞췄습니다. 각 양개문 한 세트가 출입구 하나입니다. N열 뒤 보행 공간을 두고 스크린과 무대 바닥을 분리했습니다. 공간 비례는 제공된 BMP의 왼쪽 ‘컨퍼런스홀 3층 평면도’를 참고한 화면 표현이며 실측값이 아닙니다. 스크린·무대를 누르면 [중강당 LED 현수막 제작기](https://erakeun.github.io/conference-hall-led-maker/)가 새 탭에서 열립니다.

## 로컬 실행

```sh
python3 -m http.server 4173 --directory dist
```

브라우저에서 `http://localhost:4173`을 엽니다. 별도 빌드나 외부 API는 필요하지 않습니다.

## 파일 구조

- `dist/seat-data.js`: 좌석 원본 데이터
- `dist/seat-layout.js`: 좌석 표시 좌표, 회전 외곽, 통로와 두 출입문 위치
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
node --check dist/roster-engine.js
node --check dist/roster-ui.js
node scripts/validate.cjs
node tests/roster-engine.test.cjs
node tests/seat-layout.test.cjs
```

검증 스크립트는 총 406석, 구역별 `60 / 82 / 126 / 79 / 59`, 좌석 ID 고유성과 외측 A~I열 범위를 확인합니다.
