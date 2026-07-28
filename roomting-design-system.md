# Roomting 디자인 시스템 (2026-07-25 확정)

이 문서는 지금까지 채팅에서 다듬은 디자인 결정을 정리한 것입니다.
Claude Code가 전 화면에 일관되게 적용할 때 참고용으로 씁니다.

---

## 0. Stitch와의 역할 분담 (2026-07-26 확정)

- **Stitch가 결정하는 것**: 중립색/상태색 팔레트(브랜드 핑크 제외),
  여백, 모서리 둥글기, 카드·버튼 모양, 요소 배치 등 "시각적으로
  얼마나 조화롭고 세련되어 보이는가"에 관한 전부
- **Stitch가 결정하지 않는 것 (고정, Stitch 제안이 와도 반영 안 함)**:
  브랜드 컬러(`--pink` #F05A7E), 화면에 어떤 내용을 넣고 뺄지
  (정보구조), 기능 흐름. 예: "조건 입력 전에는 매물 미리보기를
  보여주지 않는다", "지도 카드를 홈 화면에서 다시 보여주지 않는다"
  같은 결정은 시각 디자인이 아니라 전략적 판단이라 Stitch 제안과
  무관하게 유지한다.
- Stitch가 레이아웃을 새로 제안하면서 위에서 고정한 정보구조를
  건드리는 요소(신규 섹션, 매물/통계 미리보기 등)를 끼워 넣는
  경우, 시각 스타일만 취하고 그 요소는 제외한다.

---

## 1. Design Principles — Content First

- 매물 사진은 항상 브랜드 컬러보다 먼저 보여야 한다.
- 브랜드 컬러는 콘텐츠를 강조하는 역할이다.
- 카드는 콘텐츠를 담는 그릇이다.
- 사진 영역은 항상 가장 크게 확보한다.
- Airbnb의 콘텐츠 중심 철학을 참고한다.

---

## 2. 공통 토큰 (모바일 · 관리자 공용)

### 왜 이 색(핑크 #F05A7E)인가 — 2026-07-26 확정, 2026-07-28 코랄 톤(#F05A7E)으로 재확정, 4色 비교 테스트 거침

- **카테고리 내 공백**: 직방(주황) · 다방(파랑) · 네모(빨강) 등 국내
  부동산 앱들이 이미 각자 색을 선점한 상태에서, 핑크 계열은
  이 카테고리 안에 아직 비어있음. 에어비앤비 등 타 서비스가
  핑크/코랄을 쓰지만 업종(숙박)이 달라 혼동 리스크 없음.
- **타겟 정서와의 합치**: 룸팅의 핵심 타겟(한국이 낯선 외국인
  워킹홀리데이·유학생)에게는 신뢰감보다 "친근함·접근하기 쉬움"이
  우선순위가 높음. 밝은 코랄핑크가 이 정서에 부합.
- **이미 각인 시작됨**: 로고 심볼, 앱 아이콘, 스플래시 화면 등
  실제 자산이 이미 이 색 기준으로 제작 완료됨. 지금부터가
  브랜드 각인이 쌓이기 시작하는 시점이라, 여기서 흔들리면
  각인 효과 자체가 약해짐.

**주의**: Stitch, ChatGPT, Gemini 등 외부 AI 디자인 도구가 다른
색상(예: 와인색 #ac254f, #FF647C 등)을 기본값 또는 제안으로
내놓을 수 있음. 이는 각 도구가 임의로 설정한 기본값이거나
일반론적 제안일 뿐, 위 근거를 대체할 만한 새로운 논거가 아니면
반영하지 않는다. 색상 재검토가 필요하다고 판단되면, 스와치가
아닌 실제 로고/버튼에 적용한 비교본을 먼저 만들어 위 3가지
기준으로 재평가할 것.

```css
--pink: #F05A7E;       /* 브랜드 컬러, primary CTA */
--pink-soft: #FDEEF1;  /* 배경/active 상태 */
--pink-dim: #F8D6DE;   /* 보더 */
--ink: #1C1A19;        /* 본문 텍스트 */
--ink-soft: #8A8480;   /* 보조 텍스트 (기존 #6B6562보다 밝게 통일) */
--line: #EFEBE7;       /* 구분선 */
--paper: #FFFCFB;      /* 카드/배경 (2026-07-25 브랜드 리프레시 시 확정, 거의 흰색에 가까운 웜톤) */
--success: #2A9D5C;    /* 성공/승인/응답대기 등 긍정적 상태 표시 (2026-07-26 추가, 여러 화면에서 하드코딩 반복되어 정식 토큰화) */
--success-soft: #E8F5EC; /* 성공 상태 배경(뱃지 등) */
```

**Typography**
```css
--font-display-size: 40px; --font-display-weight: 700; --font-display-line-height: 48px;
--font-h1-size: 32px; --font-h1-weight: 700; --font-h1-line-height: 40px;
--font-h2-size: 28px; --font-h2-weight: 700; --font-h2-line-height: 36px;
--font-h3-size: 24px; --font-h3-weight: 600; --font-h3-line-height: 32px;
--font-title-size: 20px; --font-title-weight: 600; --font-title-line-height: 28px;
--font-body-size: 16px; --font-body-weight: 400; --font-body-line-height: 24px;
--font-body-small-size: 14px; --font-body-small-weight: 400; --font-body-small-line-height: 20px;
--font-caption-size: 12px; --font-caption-weight: 400; --font-caption-line-height: 16px;
```

**Spacing** (4px Grid)
```css
--space-4: 4px;
--space-8: 8px;
--space-12: 12px;
--space-16: 16px;
--space-24: 24px;
--space-32: 32px;
--space-48: 48px;
--space-64: 64px;
```

**Radius**
```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
```

**Shadow**
```css
--shadow-sm: 0 1px 2px rgba(15,23,42,.06);
--shadow-md: 0 4px 12px rgba(15,23,42,.08);
--shadow-lg: 0 12px 32px rgba(15,23,42,.12);
```

**Motion**
```css
--transition-fast: 150ms ease-out;
--transition-default: 200ms ease-out;
--transition-modal: 250ms ease-out;
```

폰트: `Noto Sans KR` (본문) + `Manrope` (숫자/로고타입)

---

## 3. Color Usage Rules

> 이 섹션은 컬러 **사용 방식**(어디에 얼마나 쓰는가)에 대한 단일 기준(Source of Truth)이다.
> 색상 토큰 자체의 값/이름은 위 2번 섹션이 기준이며 이 섹션에서 변경하지 않는다.
> 문서 다른 곳에 컬러 사용에 관한 서술이 남아있다면 이 섹션을 따르도록 정리한다.

### 철학
브랜드 컬러(#F05A7E)는 ROOMTING의 정체성을 표현하는 색이지만,
UI 전체를 채우는 색이 아니라 "사용자의 행동(Action)"을 강조하는 포인트 컬러로만 사용한다.

ROOMTING는 Airbnb와 같은 철학을 따른다.
브랜드 컬러는 로고와 주요 CTA, 선택 상태에만 사용하고,
나머지 UI는 White + Neutral Gray 중심으로 구성한다.

집 사진과 콘텐츠가 항상 브랜드 컬러보다 먼저 보여야 한다.

---

### Color Usage Ratio (60-30-10)

60%
- White / Surface / Background
- 기존 Neutral Token(`--paper` 등)

30%
- Text / Icon / Divider
- 기존 Dark Neutral(`--ink` 등)

10%
- Brand Pink (`--pink` #F05A7E)
- 아래 용도로만 사용

---

### Brand Pink 사용 가능 영역

브랜드 핑크는 아래에서만 사용한다.

- 화면당 가장 중요한 Primary CTA 버튼 1개
- 선택된 Bottom Navigation / Tab
- Toggle ON
- Checkbox / Radio 선택 상태
- 좋아요(찜) 상태
- 진행 상태(Active)
- 로고 및 브랜드 요소

---

### Brand Pink 사용 금지

다음 용도로는 브랜드 핑크를 사용하지 않는다.

- 카드 전체 배경
- 일반 본문 텍스트
- 일반 아이콘
- Section 배경
- Divider
- 여러 개의 Primary 버튼을 한 화면에 배치
- Decorative Element를 위한 과도한 사용

---

### Component 적용 원칙

**Button**

Primary
- Pink Background
- White Text

Secondary
- White Background
- Pink Border
- Pink Text

Ghost
- Transparent
- Pink Text

Danger
- Error Color
- White Text

**Card**

- White Background
- Neutral Border
- Shadow만으로 구분
- 브랜드 컬러를 배경색으로 사용하지 않는다.

**Icon**

기본
- `--ink`

비활성
- `--ink-soft`

활성
- Brand Pink

**Sizing**

- Button Height → Spacing Tokens 참조
- Input Height → Spacing Tokens 참조
- Card Radius → Radius Tokens 참조
- Bottom Sheet Radius → Radius Tokens 참조
- FAB Size → Spacing Tokens 참조

---

### 목적

사용자는 브랜드 컬러보다
매물 사진과 콘텐츠를 먼저 인식해야 한다.

브랜드 컬러는 "여기를 누르세요"를 알려주는 신호이며,
화면을 장식하기 위한 색이 아니다.

---

## 4. 아이콘: 이모지 전면 금지

- 전 화면의 🏠🗺️💬👤📋🚪✓ 등 이모지 아이콘 → **Lucide 아이콘(SVG)**으로 교체
- 규칙: `stroke="currentColor"`, `stroke-width: 2`, 색은 CSS로 제어 (하드코딩 금지)
- 이미 확보한 아이콘: home, map, map-pin, message-circle, user, check, wallet,
  bed, clipboard-list, log-out, arrow-right, search, x
- 추가로 필요한 아이콘은 `lucide-static` npm 패키지에서 동일한 방식으로 가져올 것

**예외 (2026-07-26 확정)**: 언어 선택 UI의 국기 이모지(🇰🇷🇯🇵🇨🇳 등)는
이 금지 원칙에서 제외한다. 국기는 장식용 아이콘이 아니라 해당 언어/국가를
나타내는 유일한 시각 기호이며, Lucide를 포함한 어떤 라인 아이콘 세트에도
대응하는 아이콘이 없다. 억지로 대체하면 오히려 어느 언어인지 식별이
어려워져 사용성이 떨어진다.

---

## 5. 레이아웃 원칙 (전 화면 공통)

1. **박스 중첩 금지** — 카드 안에 카드, 태그 안에 배경박스 등 이중 테두리 구조 지양
2. **한 화면 = 주요 액션 1개** — CTA 여러 개를 같은 무게로 나열하지 않기
   (버튼 색상은 3번 Color Usage Rules의 Component 적용 원칙을 따른다 — Primary/Secondary/Ghost)
3. **같은 내용 반복 설명 금지** — 그래픽/카드가 이미 보여준 내용을 아래 텍스트로 또 설명하지 않기
4. **여백 우선** — 콘텐츠보다 여백이 아까워 보이지 않을 정도로 넉넉하게
5. **뱃지/이모지 남발 금지** — 꼭 필요한 경우가 아니면 텍스트만으로

---

## 6. 하단 탭바 (모바일 화면 전용)

대상: 랜딩, 지도, 채팅, 상세, 마이페이지, 요청서, 응답 화면
(회원가입 단계 화면·관리자 화면 제외)

구성: **홈 / 지도 / 채팅 / MY** (4개 고정)
- "요청서" 탭은 없앰 — 조건 입력은 홈의 메인 CTA로 충분, 자주 안 쓰는 화면은 MY 안으로
- active 상태: 아이콘에 `--pink-soft` 배경의 둥근 사각형(10px radius) 적용, 라벨은 `--pink`
- inactive 상태: 아이콘/라벨 모두 연한 회색(#C3BCB6), 배경 없음
- `position: fixed; bottom: 0`, 화면 전환 시에도 유지 (매번 다시 로드 X)

---

## 7. 스플래시 스크린 (앱 최초 진입시 1회만)

- 흰 배경(`--paper`) + 로고 마크 + 워드마크, scale(0.88→1) + fade-in, 0.7s
- 1.1초 유지 후 전체 fade-out(0.5s)하며 메인 화면 노출
- **탭 이동 시에는 절대 재노출 금지** — 앱 콜드 스타트(첫 로드) 시에만

---

## 8. 관리자(admin) 화면: 별도 데스크톱 레이아웃

- 색상 토큰/아이콘 세트는 모바일과 동일하게 사용 (브랜드 일관성 유지)
- 레이아웃은 모바일 430px 프레임이 아닌 **데스크톱 대시보드 구조**:
  - 좌측 고정 사이드바 (메뉴: 매물 관리 / 요청서 관리 / 공인중개사 승인)
  - 우측 콘텐츠 영역: 리스트/테이블 기반, max-width 없이 화면 대응
  - 하단 탭바 없음 (사이드바가 그 역할을 대신함)
- 반응형은 필수는 아니지만, 최소 태블릿 너비까지는 안 깨지게

---

## 9. 화면별 현재 상태 · 필요 작업

| 화면 | 탭바 | 아이콘 교체 | 레이아웃 단순화 | 비고 |
|---|---|---|---|---|
| 랜딩 (roomting-landing-v5.html) | 추가 필요 | 필요 | 필요 (채팅 목업 참고) | 스플래시도 여기서 진입 |
| 지도 (roomting-map-v2.html) | 추가 필요 | 필요 | 검토 | |
| 채팅 (roomting-chat-v2.html) | 추가 필요 | 필요 | 검토 | |
| 상세 (roomting-detail-v2.html) | 불필요 (상세는 하위화면) | 필요 | 검토 | |
| 마이페이지 (roomting-mypage-v2.html) | **이미 있음, 수정 필요** | 필요 | 검토 | 탭 구성을 홈/지도/채팅/MY로 교체 (기존 "요청서" 탭 제거) |
| 요청서 (roomting-request-v4.html) | 불필요 | 필요 | 검토 | |
| 응답 (roomting-response-v2.html) | 불필요 | 필요 | 검토 | |
| 회원가입 선택 화면 (/signup) | 불필요 | 필요 | 여백 버그 수정 (지난 스크린샷 이슈) | |
| 일반회원 가입 (roomting-signup-v2.html) | 불필요 | 필요 | 검토 | |
| 공인중개사 가입 (/signup/realtor) | 불필요 | 필요 | 검토 | |
| 관리자 화면 (/admin) | 사이드바로 대체 | 필요 | 8번 항목대로 신규 구축 | |

---

## 10. 참고 목업 (이번 대화에서 제작)

- `roomting-landing-with-splash.html` — 스플래시 + 심플 레이아웃 + 탭바 + Lucide 아이콘 예시

---

## 11. UI States

- **Loading**: 기본은 `--ink-soft` 뉴트럴. 진행 상태를 강조해야 하는 경우에 한해 3번 Color Usage Rules의 "진행 상태(Active)" 허용 영역에 따라 Brand Pink 사용 가능. 전환에는 `--transition-fast`를 사용한다.
- **Empty**: 텍스트는 `--ink-soft`. Brand Pink는 사용하지 않는다(3번 Color Usage Rules "Brand Pink 사용 금지" 원칙). 안내 CTA가 필요하면 화면당 1개까지만 허용한다(5번 레이아웃 원칙 "한 화면 = 주요 액션 1개").
- **Error**: Button "Danger" 변형과 동일한 Error Color를 사용한다(3번 Color Usage Rules Component 적용 원칙 참조). Error Color의 정확한 토큰 값은 아직 미확정 — 14번 Pending Decisions 참조.

---

## 12. Navigation

- **Bottom Navigation**: 6번 하단 탭바 규칙을 그대로 따른다(모바일 전용, 홈/지도/채팅/MY 4탭).
- **Top App Bar**: 아직 정의되지 않음. 화면별 적용 시 별도 확정이 필요하다.
- **Desktop Navigation (Reserved)**: 8번 관리자 화면의 좌측 사이드바 구조를 향후 확장 자리로 예약한다. 현재는 관리자 화면 전용으로만 확정되어 있다.

---

## 13. Property Card

- 사진이 카드의 60% 이상을 차지한다.
- 텍스트는 최소화한다 (가격 · 위치 · 방 유형 등 핵심 정보만).
- 카드 구분은 Shadow만으로 하며, White Card를 사용한다(3번 Color Usage Rules Component 적용 원칙 "Card" 참조).
- Content First 철학을 적용한다(1번 Design Principles 참조).
- Property Card는 ROOMTING의 대표 컴포넌트(Core Component)이며, 향후 모든 리스트/추천/검색 결과 화면은 이 규칙을 기본으로 상속한다.

---

## 14. Pending Decisions

- **[완료 2026-07-28]** `theme.css`의 `--danger`가 `--pink`와 동일 값(`#E8547A`)을 사용하던 문제를 해결함. 브랜드 컬러 롤아웃(`#E8547A→#F05A7E`) 시 `--danger`를 `#DC2626`으로 분리 적용했다.
- **[결정 기록 2026-07-28] B1(Abstract Shape) 최종 심볼 후보 확정**
  - 확정: Door/Match/Home Flow 계열 및 R모노그램·웨이브 대비 기억성·브랜드 소유성·확장성에서 최상위 → B1을 최종 후보로 확정.
  - 미해결: 브랜드 컬러(#F05A7E) 배경 위 흰색 반전 버전을 Stitch로 3회 시도했으나 매번 실제 형태(뒤틀린 삼각형 3개) 대신 단순 사각형/사각 테두리로 뭉개져 렌더링됨. Stitch 렌더링 한계로 판단.
  - 추가 리스크: 16px 파비콘 크기에서 날개 사이 좁은 틈이 뭉개질 위험 있음 — Figma 등 벡터 툴에서 16/32/40px 소형 검증 필요.
  - 후속 조치: (1) Figma 등에서 반전 버전 및 소형 렌더링 검증 → (2) 검증 통과 시 roomting-symbol-b1.svg의 내용을 roomting-symbol.svg에 덮어써서 기존 8개 컴포넌트의 import 경로 변경 없이 교체 → (3) favicon.svg 및 raster 아이콘(favicon-16x16.png, favicon-32x32.png, favicon.ico, apple-touch-icon.png)도 함께 갱신.
