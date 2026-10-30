# 와일즈 스킬 시뮬레이터 (비공식)

몬스터 헌터 와일즈 방어구 세팅 시뮬레이터입니다. 브라우저에서만 동작하는 정적 사이트로, GitHub Pages 에 배포합니다.

- **수동 세팅**: 무기·방어구·호석·장식주를 직접 골라 발동 스킬과 방어력을 확인
- **스킬 검색**: 원하는 스킬을 만족하는 방어구 조합 검색
- **비선호 스킬 제외**: 원하지 않는 스킬이 붙은 조합을 빼거나 결과 하단으로 분리
- **내 세팅**: 세팅을 브라우저에 저장해 목록으로 관리, 공유 링크·코드로 주고받기, 백업 내보내기/가져오기(복사·붙여넣기용 백업 코드 또는 파일)
- **내 호석**: 감정 호석을 등록해 세팅·검색에 사용 (게임 스크린샷을 올리면 스킬·슬롯을 읽어 등록)
- **Google 드라이브 동기화**: Google 계정을 연결하면 내 세팅·내 호석·검색 조건을 기기끼리 자동으로 맞춤 (서버 없이 내 드라이브의 앱 전용 숨김 폴더에 저장, [개인정보 처리방침](public/privacy.html))

설계와 게임 규칙 정리는 [docs/DESIGN.md](docs/DESIGN.md) 를 참고하세요.

## 개발

```bash
npm install
npm run dev          # 개발 서버
npm test             # 단위 테스트 (Vitest)
npm run build        # 타입 체크 + 프로덕션 빌드 (dist/)
npm run lint         # oxlint
npm run data:update  # MHDB 에서 게임 데이터 갱신 → public/data/wilds.json
```

## 배포 (GitHub Pages)

1. GitHub 에 레포를 만들고 push 합니다.
2. 레포 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. `main` 브랜치에 push 하면 `.github/workflows/deploy.yml` 이 빌드·배포합니다.
   (`<user>.github.io/<repo>/` 경로에 맞게 base 경로가 자동 설정됩니다.)

## 데이터 출처와 고지

- 게임 데이터: [MHDB](https://docs.wilds.mhdb.io) — 게임 파일에서 추출한 데이터
  ([mhdb-wilds-data](https://github.com/LartTyler/mhdb-wilds-data), GPL-3.0).
  `scripts/build-data.mjs` 가 시뮬레이터에 쓰는 값만 골라 `public/data/wilds.json` 으로 변환합니다.
- 스크린샷 글자 인식: [tesseract.js](https://github.com/naptha/tesseract.js)(Apache-2.0)와 한국어 학습 데이터
  ([tessdata](https://github.com/tesseract-ocr/tessdata_best), Apache-2.0)를 사이트에 함께 올려 브라우저 안에서만 씁니다.
- 이 사이트는 캡콤의 지식재산을 이용한 비공식 팬메이드(2차 창작) 도구이며, 캡콤과 관련이 없습니다.
  [캡콤 2차 창작 가이드라인](https://www.capcom-games.com/ko-kr/fan-content-guidelines/)에 따라
  영리 목적으로 운영하지 않으며, 게임에서 추출한 이미지·아이콘·로고를 사용하지 않습니다.

## 라이선스

[GNU GPL v3.0](LICENSE). 게임 데이터 원본이 GPL-3.0 이라 코드와 변환한 데이터 모두 같은 라이선스로 배포합니다.
몬스터 헌터의 이름·수치 등 게임 콘텐츠에 대한 권리는 캡콤에 있으며, 이 라이선스로 허락하는 대상이 아닙니다.
