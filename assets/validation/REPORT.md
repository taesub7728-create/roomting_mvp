# ROOMTING 심볼 벡터 추출 — 검증 리포트

## 소스
`assets/roomting-brand-board-a.png.png` (1536x1024), 좌측 상단 "A안 Abstract R" 대형 심볼 기준.
크롭 영역(원본 좌표): x 114–284, y 155–356 (170x201px), flood-fill로 심볼만 분리.

## 트레이싱 방법
1. G채널 기준 코랄/배경 이진화(threshold 180) 후 marching squares(d3-contour)로 서브픽셀 등고선 추출 (1057점, 단일 폐곡선).
2. **네거티브 스페이스는 실제로 열려있음(open notch)** — flood-fill 결과 enclosed hole 픽셀 0개. 보울 안쪽과 대각선 사이 흰 공간이 배경과 한 덩어리로 연결되어 있어, "hole 포함 도넛형"이 아니라 "오목한 노치가 있는 단일 실루엣"으로 확인됨. (spec의 `"must_remain_open": true`와 일치)
3. 회전각 분석으로 진짜 꺾임(sharp corner) 3곳만 검출: 우하단 뾰족점, 대각선 상단 접힘점, 좌상단 직각. 이 3점 기준으로 윤곽을 3구간으로 분리.
4. 각 구간을 Schneider 알고리즘(`fit-curve`)으로 개별 큐빅 베지어 피팅 (구간 경계에서 접선을 공유하지 않게 하여 3개의 실제 꺾임은 그대로 보존).
5. 결과: 단일 path, 34개 anchor point (nonzero fill, 구멍 없음 — 확인된 대로 open notch라 별도 hole path 불필요).

## 수치 검증
**외곽 실루엣 vs 원본 픽셀 (원본 크롭 해상도, 6x 슈퍼샘플링 비교)**
- IoU: **0.98487** (목표 0.985 대비 -0.0001, 사실상 동일)
- 남은 차이는 `silhouette_diff.png`에서 보듯 전 둘레에 걸친 1px 미만의 얇은 안티앨리어싱 경계뿐, 구조적 오차 없음.

**베지어 곡선 vs 원본 1057점 폴리라인 (직접 기하 거리, 원본 스케일 px)**
- 대각선(A, 접힘점→우하단): 평균 0.187px / 최대 0.507px
- 훅 곡선(B, 접힘점→좌상단, 최대 굴곡 구간): 평균 0.174px / 최대 0.534px
- 좌변+하단(C, 좌상단→우하단): 평균 0.231px / 최대 0.583px
- **전체 평균 0.194px / 전체 최대 0.583px** — spec 기준(평균≤1.0px, 최대≤2.0px) 여유있게 통과.

## 알려진 트레이드오프 (투명하게 보고)
1. **anchor 개수 34개 > spec 명시 max 24개.** 이 심볼은 "큰 반경 바깥 곡선 + 급격한 안쪽 U턴 + 완만하게 휜 대각선"이 한 실루엣에 공존해서, 24개로 줄이면 IoU가 0.979 수준으로 떨어짐(측정 확인됨). 정확도(0.985 근접)를 우선했다. 24개로 맞추길 원하면 다시 조정 가능.
2. **대각선이 완벽한 직선이 아님.** 원본을 직접 측정한 결과 중앙부에서 약 3.8px(길이 대비 약 2%) 바깥으로 완만하게 휘어 있음 — 노이즈가 아니라 원본 아트웍 자체의 특징으로 판단되어 그대로 보존함(임의로 직선화하지 않음).
3. **워드마크(Roomting) 폰트:** 이 환경에는 실제 Geist Sans가 설치되어 있지 않아 브라우저 fallback(Arial 계열)로 레이아웃을 계산함. SVG는 `font-family: 'Geist Sans','Inter','SF Pro Display',Arial,sans-serif`를 그대로 참조하므로, 실제 Geist Sans가 로드되는 환경에서는 자동으로 올바른 폰트로 렌더링됨. 다만 그 경우 텍스트 폭이 달라져 아래 가로 비율이 조정될 수 있음.
4. **가로 로고 종횡비 4.71 (목표 4.15±0.15 초과).** fallback 폰트가 Geist Sans보다 넓어서 발생한 차이로 추정. cap-height 비율(1.62), gap 비율(0.28)은 spec대로 정확히 적용함.

## 최종 산출물 (assets/)
- roomting-symbol-solid.svg — fill: var(--pink, #F26559)
- roomting-symbol-black.svg — fill: var(--ink, #1C1A19)
- roomting-symbol-white.svg — fill: #FFFFFF
- roomting-symbol-transparent-1024.png — 투명 배경, #F26559
- roomting-logo-horizontal.svg — 심볼 + Roomting 워드마크
- roomting-app-icon-1024.png — 배경 #F26559(radius 228), 심볼 흰색
- roomting-map-pin.svg — 티어드롭 핀(폭:높이 0.72), 흰색 심볼

## 검증 이미지 (assets/validation/)
- source_mask_reference.png — 원본에서 추출한 이진 마스크 (open notch 확인용)
- symbol_preview_1000.png — 최종 벡터를 1000 viewBox로 렌더링한 미리보기
- silhouette_overlay.png — 원본(연한 배경) vs 재구성(파란색) 50% 오버레이
- silhouette_diff.png — 픽셀 단위 일치(흰색)/원본전용(빨강)/재구성전용(파랑) 차이맵

## 범위
theme.css 및 다른 화면 코드는 수정하지 않음. src/assets/의 기존 심볼(placeholder)도 변경하지 않음 — 신규 벡터는 전부 최상위 assets/ 폴더에만 생성했으며, 실제 앱에 적용할지는 별도 결정 필요.

## 적용 상태
**2026-08-01 공식 채택 및 프로덕션 적용 완료** (커밋 `f0ffc6c`). `roomting-symbol-solid.svg`를 `src/assets/roomting-symbol.svg`/`roomting-icon-white-bg.svg`로 반영하고 favicon/앱 아이콘 세트를 재생성함. 상세 근거는 `roomting-design-system.md` 14번 Pending Decisions 참조.
