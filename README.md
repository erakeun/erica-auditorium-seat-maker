# ERICA 컨퍼런스홀 중강당 3층 좌석배치 제작기

지정 제작 기준 406석을 행사별로 배정하고 JSON 파일로 저장·복원하는 독립 정적 웹앱입니다.

가운데 `L2 / C / R2`는 같은 행을 수평으로 맞추고, 양쪽 `L1 / R1`은 도면 판독 기준 약 45도로 꺾인 날개 형태로 배치했습니다. 이 각도와 전체 배치는 실측 도면이 아닙니다.

## 로컬 실행

```sh
python3 -m http.server 4173 --directory dist
```

브라우저에서 `http://localhost:4173`을 엽니다. 별도 빌드나 외부 API는 필요하지 않습니다.

## 파일 구조

- `dist/seat-data.js`: 좌석 원본 데이터
- `dist/app.js`: 배정, 검색, 저장·복원, 확대·이동 기능
- `dist/styles.css`: 화면 및 A3 가로 인쇄 스타일
- `dist/index.html`: 앱 화면

`main` 브랜치에 병합하면 GitHub Actions가 `dist` 폴더를 GitHub Pages로 게시합니다.

## 검증

```sh
node --check dist/seat-data.js
node --check dist/app.js
node scripts/validate.cjs
```

검증 스크립트는 총 406석, 구역별 `60 / 82 / 126 / 79 / 59`, 좌석 ID 고유성과 외측 A~I열 범위를 확인합니다.
