# CLAUDE.md

몬스터 헌터 와일즈 비공식 방어구 세팅 시뮬레이터. Vite + React 19 + TypeScript + Tailwind v4, GitHub Pages 정적 배포.
설계·게임 규칙·검색 알고리즘은 `docs/DESIGN.md` 가 기준 문서다. 규칙을 바꾸면 그 문서도 같이 고친다.
개선·기능 요청과 데이터 오류 목록은 `TODO.md`. 항목을 처리하면 체크하고 '완료'로 옮긴다.

## 명령어

- `npm run dev` / `npm run build` (tsc -b + vite build) / `npm run lint` (oxlint)
- `npm test` (vitest, 실제 데이터 `public/data/wilds.json` 사용)
- `npm run data:update` — MHDB 에서 데이터 재생성. 결과 JSON 은 커밋한다.

## 작업 흐름

- 사용자가 직접 확인할 만한 변경이면 커밋 전에 `npm run dev` 로 로컬 서버(http://localhost:5173)를 띄워 두고, 사용자의 확인을 받은 뒤 커밋·배포한다.
- `main` 에 push 하면 GitHub Actions 가 테스트 후 GitHub Pages 에 자동 배포한다. push 는 SSH 리모트로 한다 (gh 토큰에 workflow 권한 없음).

## 구조 원칙

- `src/core/**` 는 순수 TS (React/DOM import 금지). Node 테스트와 Web Worker 에서 그대로 돈다.
- 빌드 합계 계산은 `computeBuild` 하나만 쓴다. 화면이 스킬·슬롯 계산을 따로 구현하지 않는다.
- 검색 엔진과 화면의 계약은 `src/core/search/types.ts`. 엔진 결과는 테스트에서 `resultToBuild` → `computeBuild` 로 재검증한다.
- 게임 규칙 상수(방어구 초월 등)는 데이터에 없으면 `src/core/` 의 한 파일에 모으고 출처를 주석으로 남긴다.

## UI 규칙

- UI 문구·주석은 한국어.
- 색상은 `src/index.css` 의 의미 기반 토큰만 (`bg-surface`, `text-muted`, `border-line`, `text-good/bad/warn`, `slot-1/2/3` …). 팔레트 색이나 `dark:` 변형을 직접 쓰지 않는다.
- 공통 컴포넌트(`src/components`) 재사용: `Combobox`(초성 검색), `SkillSelect`, `SlotBadge/SlotList`, `SkillChip`, `ui.tsx`.
- 이름 표시는 `nameOf()` / `src/data/format.ts` 경유 (다국어 대비).
- 모바일: 레이아웃은 화면 폭(`lg:` 2단), 터치 크기는 `pointer-coarse:` 로 나눈다. 화면 아래 조작 바는 `MobileBar`,
  대화상자 안 자동 포커스는 `autoFocus` 대신 `data-autofocus` (docs/DESIGN.md §7).
- 캡콤 2차 창작 가이드라인 준수: 게임에서 추출한 이미지·아이콘·로고, `©CAPCOM` 표기 사용 금지. 비영리.

## 코드 스타일

세미콜론 없음, 작은따옴표, 2칸 들여쓰기, 120자 안팎. 저장 형식(localStorage 키)을 바꾸면 키 버전(`:v1` → `:v2`)을 올린다.

## 여러 에이전트로 병렬 작업할 때

폴더 단위로 담당을 나눈다: `src/core/search/**`(엔진) · `src/features/<기능>/**`(화면) · `scripts/` + `src/data/`(데이터).
공용 파일(`src/core/*.ts`, `src/core/search/types.ts`, `src/components/**`, `src/state/**`, `src/lib/**`)은 한 에이전트만 고치고,
다른 에이전트는 필요한 변경을 보고만 한다. 병렬 에이전트는 `npm install`·개발 서버·커밋을 하지 않는다.
