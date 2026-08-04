# ROOMTING Phase 2 TODO

## Role 정리

### pending_realtor role 정리
- 현재 DB에 pending_realtor role을 가진 계정이 실제 존재하는지 확인한다.
- 존재하는 경우 아래 방향 중 하나로 정리한다.

정리 방법 검토:
1. 정상 심사 대기 계정 — realtor_applications 상태 기준으로 재판단, 필요 시 customer role로 복구 후 신청 상태로 관리
2. 이미 승인된 계정 — admin 승인 흐름을 통해 realtor role로 변경
3. 비정상/테스트 계정 — 데이터 정리 또는 삭제 검토

### 정리 완료 후 작업
- MyPage.jsx: profile.role === 'pending_realtor' 조건 제거 검토
- RealtorDashboard.jsx: profile.role === 'pending_realtor' 조건 제거 검토
- 최종 role 판단 기준:
  - 신청 대기 여부 → realtor_applications 기준
  - 실제 권한 → profiles.role 기준

### pending_realtor 라우트 가드 불일치 (2026-08-02 발견)

Splash/Onboarding 작업(AppEntryGate) 중 Playwright mock으로 발견한 기존 불일치:

- `MyPage.jsx`는 `profile.role === 'pending_realtor'`를 **customer와 동일하게** 취급한다
  (심사 대기 중인 고객으로 표시).
- 반면 `homePathForRole()`(`src/shared/auth/homePathForRole.js`)과
  `CustomerRoute`/`PublicCustomerRoute`(`useCustomerGuardChecks` 기반)는
  `pending_realtor`를 **realtor 그룹**으로 취급해 `/realtor` 계열로 리다이렉트한다.
- 실제 영향: AppEntryGate가 로그인 `pending_realtor` + open 요청서 보유 사용자를
  `/requests/:id`로 보내려 해도, `PublicCustomerRoute`가 그보다 먼저 `/realtor`로
  리다이렉트해버려서 실제로는 도달하지 못한다(Playwright mock으로 재현 확인,
  `/realtor` → `/realtor/pending`으로 귀결됨).
- 이번 커밋(AppEntryGate)에서는 이 기존 가드를 건드리지 않고 그대로 둠 - role/권한
  체계 변경은 CLAUDE.md 규칙상 별도 분석·승인이 필요한 사안이라 범위 밖으로 남긴다.
- 다음에 pending_realtor를 실제로 정리(위 "pending_realtor role 정리" 섹션)할 때
  이 불일치도 함께 해소 대상으로 검토할 것.

## 장기 Role 정책

profiles.role은 아래 4개 상태만 실제 운영 상태로 유지한다.

사용 role:
- customer
- realtor
- care_agent
- admin

비사용/폐기 예정:
- pending_realtor

원칙:
- 심사 상태(pending)는 role 값으로 표현하지 않는다.
- 권한(role)과 신청 상태(application status)를 분리한다.
- role 변경은 승인 흐름(admin action)을 통해서만 발생한다.

## 완료된 보안 작업 기록 (2026-07-28)

1. handle_new_user() role 위조 차단 (migration_016) — 회원가입 시 클라이언트가 
보낸 role을 무시하고 무조건 customer로 생성하도록 수정

2. profiles.role self-escalation 차단 (migration_016, 017) — prevent_self_role_change
트리거로 본인 role을 직접 변경 못 하게 차단 (admin만 예외)

3. Auth Layer 구축 — AuthProvider/useAuth로 페이지별 개별 profile 조회를 통합,
Route Guard(CustomerRoute/RealtorRoute/AdminRoute)로 인증/권한 분리

4. 심사 대기 중인 realtor 신청자의 CustomerRoute 우회 차단 — role='customer'이지만
신청서가 존재하는 경우 /realtor/pending으로 강제 리다이렉트

5. requests INSERT RLS 보강 (migration_018) — is_pending_realtor_applicant()
함수 추가, 심사 대기 중인 신청자가 API 직접 호출로 요청서를 생성하는 취약점 차단


## 다국어(i18n) 검증 미완료 항목

커밋 3(`d4be514`, 2026-08-02)에서 Chat.jsx/BottomTabBar.jsx/ComingSoon.jsx/
ProfileMissingError.jsx에 ko/ja/zh/en 번역을 적용함.

- BottomTabBar/ComingSoon은 Playwright 스크린샷으로 4개 언어 렌더 확인 완료.
- Chat.jsx/ProfileMissingError.jsx는 실제 로그인 세션이 있어야 렌더되는
  화면이라, 임의 테스트 계정을 만들지 않는 원칙상 이번엔 코드 검토
  (하드코딩 한글 잔존 0건, build+lint 통과)로만 확인하고 브라우저 실렌더는
  미검증 상태로 남김.
- 요청서 마법사(RequestWizard) 작업 때 로그인 플로우를 실제로 타게 되므로,
  그 과정에서 Chat.jsx/ProfileMissingError.jsx의 4개 언어 렌더도 함께 확인한다.

## Splash/Onboarding 검증 미완료 항목 (2026-08-02)

커밋 1~3(Splash 단순화, Onboarding, AppEntryGate 진입 분기)에서 실제 계정 없이는
확인할 수 없었던 항목:

- **safe-area 실기기 검증 완료 (2026-08-02, iPhone Safari에서 확인)**.
- **open 요청서 직행(customer/pending_realtor)**: 실제 로그인 계정이 없어 Playwright
  route interception으로 Supabase 응답을 mock해서 검증했다(가짜 세션 localStorage 주입 +
  `auth/v1/user`, `rest/v1/profiles`, `rest/v1/requests`, `rest/v1/realtor_applications`,
  `rest/v1/properties` 응답 스텁). 코드 경로 자체는 mock으로 12개 시나리오 중 11개 통과 확인했지만,
  실제 Supabase 세션·RLS를 통과하는 진짜 계정으로는 아직 검증 안 됨.
- 요청서 마법사(RequestWizard) 작업 때 실제 로그인 플로우를 타게 되므로, 그때 위 항목과
  더불어 Chat.jsx/ProfileMissingError.jsx 다국어 렌더(위 항목)까지 함께 실기기/실계정으로 확인한다.
- **404 페이지 없음**: 존재하지 않는 경로 접근 시 완전 빈 화면(예: `/onbording` 오타).
  catch-all 라우트 필요. 우선순위 낮음.
- **데스크톱 온보딩 스킵 검토**: 1024px 이상에서는 랜딩의 설명 섹션과 역할이 중복되므로
  온보딩을 건너뛰는 방안. 홈 화면 재설계 시 함께 판단.
- **ja onboarding_2 헤드라인 위도우 — 해결됨 (2026-08-02)**: "複数の仲介会社から\nそれぞれ提案が届きます"가
  375px에서 3줄로 줄바꿈되고 마지막 줄이 "ます"(2글자)만 남던 문제를
  "複数の仲介会社から\nそれぞれ提案します"로 수정. Range API로 375px에서 정확히 2줄 확인,
  카드 높이(346→390px, flex:1이 여유 흡수)와 CTA 하단 여유(50px, 변화 없음) 재확인 완료.
  (참고: ja onboarding_1은 "不動産から" 주어를 빼야만 2줄이 되는데 역매칭 메시지가 약해져서
  3줄("きます" 3글자)로 유지하기로 확정 — 3글자는 위도우로 보지 않음)

## CustomerHome (모바일 로그인 고객 홈) 관련 (2026-08-02)

- **비로그인 랜딩 미완성 (2026-08-02 변경)**: 현재 모바일 비로그인 사용자는 CustomerHome의
  no_request 상태를 본다. 서비스 소개 없이 CTA만 노출되는 임시 상태다. 데스크톱 재설계 시
  비로그인 전용 랜딩(V1/V3 정리 포함)을 만들고, 모바일 비로그인도 그 랜딩을 볼지
  CustomerHome을 유지할지 재결정한다.
- **데스크톱 홈**: 1024px 이상에서는 로그인 여부와 무관하게 기존 Landing을 유지한다
  (`HomeRoute.jsx`, 뷰포트만으로 분기). CustomerHome은 모바일 전용으로 설계돼 있어
  데스크톱에 그대로 확장하면 어색하다. 데스크톱 재설계 시 로그인 고객용 화면 구조를
  함께 결정한다.
- **로그인 후 원래 위치 복귀 미구현**: 비로그인이 보호된 화면(예: `/mypage`)에 접근해
  로그인 페이지로 리다이렉트된 뒤, 로그인 완료 후 원래 가려던 곳으로 돌아오는 처리가
  없다(`location.state`/`redirectTo` 기반 복귀 로직 자체가 코드베이스에 없음을 확인).
  요청서 마법사의 로그인 게이트 작업 시 함께 설계할 것.
- **langOptions 중복 정의**: `Landing/translations.js`와 `SignUp/translations.js`가
  각자 `langOptions` 배열을 인라인 정의하고 있고, 이번에 `CustomerHome`도 `Landing/translations.js`
  것을 가져다 씀. 공통 `LanguageSwitcher` 컴포넌트로 추출하는 것을 검토. 우선순위 낮음.
- **금액 포맷 공통 유틸 부재**: `PropertyDetail.jsx`, `MapExplore.jsx` 등 여러 화면이
  "만원"을 언어 무관하게 하드코딩하고 있다(다국어 미대응). `CustomerHome/translations.js`의
  `rentLine`/`depositLine` 함수형 포맷터 패턴을 참고해 공통 포맷터 도입을 검토.
- **국기 이모지 렌더링**: 일부 데스크톱 환경(Windows/Chromium)에서 국기 이모지가 "KR"/"JA"
  같은 박스로 대체 렌더링됨(폰트 미탑재). 모바일 실기기에서는 정상 렌더. `LandingHeader`도
  동일한 자산을 쓰므로 기존부터 있던 특성이며 코드 버그 아님. 데스크톱 대응이 필요해지면
  SVG 국기 아이콘 전환을 검토. 우선순위 낮음.

### 중개사 매물 재사용 및 지도 공개 전환 (설계 메모)

요청서 응답 시 기존 매물을 템플릿으로 선택해 응답용 `properties` 행을 생성한다.
MVP에서는 기존 DB 구조를 유지하는 복사 방식(A)을 우선 적용한다.

복사 방식의 한계: 같은 실물 매물이 여러 `properties` 행으로 복제된다. 가격 수정,
거래 완료, 공개 중지 시 관련 행이 분리될 수 있으므로, 매물 수가 축적된 이후
listings 매물 마스터 분리(B)를 재검토한다.

응답 완료 후 "이 매물을 지도에 공개 등록하시겠습니까?" 전환 흐름 제공. 응답 과정에서
이미 입력한 주소·거래유형·가격·방유형·면적·입주가능일·사진은 다시 입력시키지 않는다.
중개사무소 명칭·소재지·연락처·등록번호·대표자 정보는 중개사 프로필에서 자동 채우는
방향을 검토한다.

공개 조건: `is_public`, `lat`, `lng`, `address_public`, `listing_status` 및 광고 표시
필수항목 검증이 완료된 경우에만 지도에 노출한다. 즉시 공개하지 않고 미리보기 단계를 거친다.

중단 처리: 필수정보 입력 중 이탈 시 `properties` 행은 응답용으로 유지되고 `is_public`은
`false`로 남는다. 중개사 대시보드에서 "공개 등록 미완료" 상태를 이어서 진행할 진입점이
필요하다. 입력 중이던 값의 보존 방식은 설계 시 결정한다.

DB 현황: migration_009/011의 `request_id` nullable, `is_public`, `lat`/`lng`,
`listing_status`, `address_public` 구조를 우선 활용한다. 신규 테이블 추가는 MVP
범위에서 보류한다.

법령 검토: 인터넷 표시·광고 명시사항을 최신 법령과 국토교통부 기준으로 확인한 뒤
주거용·상업용 매물별 필수 필드와 검증 규칙을 확정한다.

## 향후 권한 모델 발전 방향

지금까지 검증된 원칙: role 하나만으로 권한을 판단하지 않는다.

현재는 profiles.role + realtor_applications 존재 여부 조합으로 판단하고 있음.

서비스가 확장되면 아래 방향으로 발전 필요:

- role + application 상태 + account 상태(active/suspended 등)를 종합 판단
- 향후 중개사 정지, 광고 권한, 유료 회원, 에이전트 권한, 세분화된 관리자 권한 추가 시 기반 구조로 활용
- 장기적으로 canCreateRequest(), canReceiveRequests() 같은 공통 권한 판단 함수 레이어로 발전 고려

## 요청서 마법사(RequestWizard) 관련 검토 (2026-08-03)

### 계약기간 조건 개선
단순 기간 슬라이더뿐 아니라 "협의 가능" 체크박스 추가 검토. 중개사가 집주인과
직접 조율 가능한 경우가 많아(검색형 플랫폼은 이 조율을 대신할 수 없음), 요청서에서
조율 의향을 함께 전달하면 응답률 상승 기대. 마법사 리디자인 시 함께 반영.

### 매물 검수 정책
요청 응답 단계는 채팅으로 유저가 직접 확인하므로 1차 검수 효과가 있음. 지도 공개
전환 시점이 실질적 검수 지점.

자동 검수 규칙(지도 공개 시 필수):
- 보증금/월세 비율이 지역 시세 대비 이상치면 공개 보류 + 재확인 요청
- 동일 중개사·동일 주소 중복 등록 차단
- 광고 표시 필수항목 미충족 시 공개 불가

사람 검수(관리자 승인)는 매물 수가 늘어난 뒤 도입 검토. 초기엔 자동 검수 +
유저 신고 버튼으로 대응.

### 경쟁사 매물 수 실측 검토
다방/직방 표시 매물 수는 상가·사무실·중복 등록이 섞여 신뢰할 수 없음(중개사 지인
사례: 상가 1건을 당근에 300개 등록). 실제 원/투룸 유효 매물 규모는 투자 설명·전략
수립 시점에 표본 실사로 재확인 필요.

### 지도 마커 클러스터링 (우선순위 상향)
현재 가격 텍스트 직접 표기 방식에서 다방/직방/네이버부동산 방식(건수 클러스터 →
확대 → 개별 상세)으로 전면 전환한다. 매물 축적 후 나중에 붙이기보다 처음부터
클러스터 구조로 구현하는 것이 컴포넌트 재작업을 줄인다.

구조:
- 반경 내 매물 2개 이상 → 숫자 클러스터 배지
- 클러스터 탭 → 확대 + 하단 시트에 매물 리스트
- 최대 확대에서 개별 핀 탭 → 매물 상세 화면
- 임계값(2개)은 초기 매물량 보고 조정

### 지도 준비중 게이트
클러스터링 UI는 완성해두고 feature flag로 노출 여부만 제어. 매물 축적 상황 보고
관리자가 켜고 끌 수 있게. 탭바는 4개 유지, 눌렀을 때 준비중 화면만 표시(탭 숨김
아님). flag는 배포 없이 전환 가능한 방식 우선 검토(환경변수 / DB 설정값 / 관리자
화면 토글).

## RequestWizard 단계형 전환 (2026-08-03, DB 적용·로컬 검증 완료 · 실계정 테스트 대기)

RequestWizard를 단일 스크롤 폼에서 6단계 마법사(지역 → 거래조건 → 방타입 → 입주조건 →
추가요청 → 확인)로 전환했다. property_category(residential 전용 CHECK)와
deal_type(월세/전세) 컬럼을 새로 추가했고(migration_020/021, Supabase 적용 완료), step
definition은 id/component/isApplicable/validate로 구성해 office/retail 카테고리를
categorySteps에 항목만 추가하면 확장되는 구조로 설계했다.

**완료됨:**
- migration_020/021 Supabase 적용 완료. 사전 스키마 확인, 백필 검증(0건), 거부
  테스트 7개(office 카테고리, rent+대출필드, jeonse 대출미입력, jeonse 최대보증금
  누락, 범위 역전, 음수 min/max)·정상 테스트 5개 전부 의도대로 통과 확인
  (모든 테스트는 begin/rollback으로 실제 데이터 미반영)
- 빌드(`vite build`)/린트(`oxlint`) 통과, 새로 추가한 코드에서 발생한 경고 없음
- 로컬 Playwright QA: 월세 6단계 전체 흐름, 전세 흐름(범위 입력 + 미리보기 + 대출
  미입력→review 경고→수정→복귀), 슬라이더 트랙 가시성, CTA/본문 비겹침(스크롤 후
  좌표 측정), draft 저장/재개(새로고침 전후 상태 동일 확인), 비로그인 제출→
  PENDING_REQUEST_KEY 저장→로그인 페이지 이동, review 단계 브라우저 뒤로가기(confirm
  없이 이탈 + 안내 배너) — 전부 확인, 콘솔 에러 없음

**아직 안 된 것:**
- 실제 로그인 계정으로 로그인 후 자동 제출(PENDING_REQUEST_KEY 소비)까지 이어지는
  end-to-end 확인 — 지금까지는 "로그인 페이지로 리다이렉트되고 payload가 저장되는
  것"까지만 확인, 로그인 이후 실제 requests insert까지는 미확인
- 기존에 남아있던 "Chat.jsx/ProfileMissingError.jsx 4개 언어 렌더 미검증", "open
  요청서 직행 실계정 미검증" 항목(위 Splash/Onboarding 섹션 참고)도 이번에 함께
  확인하려 했으나, 임의 테스트 계정을 만들지 않는 원칙상 아직 미완료 — 다음
  작업(로그인 게이트 실사용 검증) 때 자연스럽게 함께 확인

### 뒤로가기 확인 다이얼로그 — 미구현 (기술적 제약)
review 단계에서 브라우저/제스처 뒤로가기 시 확인 다이얼로그를 띄우는 안은 검토했으나
보류했다. 이 프로젝트가 순수 `<BrowserRouter>`를 쓰고 있어 React Router v7의
`useBlocker`(data router 전용)를 바로 쓸 수 없고, 수동 popstate 가로채기는 전례가
없는 새 패턴이라 리스크 대비 효용이 낮다고 판단. 대신 review 단계 상단에 "입력한
내용은 자동 저장돼요" 안내 문구로 대체했다. `createBrowserRouter` 전환을 별도로
결정하면 재검토.

### 상가·사무실 지원 (설계 단계)
공통 요청 단계(지역/거래조건/입주일정/추가요청/확인)는 재사용하고 카테고리별 조건
단계만 분기하는 구조로 설계할 예정(property_category 컬럼과 step definition의
categorySteps 구조는 이미 이번 작업에서 마련됨, 실제 office/retail 필드는 미구현).
구현 및 검증 완료 후 실제 완료일을 기록한다.

사무실: 희망 면적(구간 선택형), 사용 인원, 엘리베이터, 주차
상가: 희망 면적(구간 선택형), 희망 업종, 권리금, 층 선호

면적은 정확한 숫자보다 구간 선택형 우선 검토.

주거 마법사 실사용 검증 후 별도 설계 및 DB 필드 확정. 카테고리 동시 오픈은 초기
수요·공급 밀도를 분산시킬 수 있어 주거 검증 완료 전까지는 열지 않는다.

### 거래 유형(전세) 관련
전세자금대출은 이용함/이용 안 함 2종으로 단순화했다. 근거: 중개사 입장에서 대출
가능 여부는 매물 선택에 실제로 영향을 줄 수 있으나, MVP에서 "미정" 옵션까지 3종으로
늘릴 만큼 정보 가치 차이가 크지 않다고 판단. 이용 여부는 review 단계에서 인라인으로
필수 확인(전세인데 미입력이면 제출 버튼 비활성화 + 안내), transaction 단계에서는
막지 않는다 — 다른 단계는 자유롭게 다음으로 넘어갈 수 있는데 이 항목만 그 자리에서
막히면 혼란스러울 수 있어, 눈에 보이는 시점(review 진입 즉시)에 안내하는 쪽을 택함.

전세보증금은 단일 구간 칩 선택 방식을 검토하다 폐기하고, 최소(선택)/최대(필수) 직접
숫자 입력 방식으로 최종 확정했다. 구간 칩은 "1억 5천~2억"처럼 사용자가 원하는 정확한
범위를 표현할 수 없다는 한계가 있어(칩 경계와 실제 희망액이 어긋나는 문제가 재발),
자유 범위 입력으로 근본 해결. deposit_max(기존 컬럼, 월세와 공용)를 전세 최대
보증금으로 재사용하고, deposit_min(신규)은 선택 입력. DB CHECK(양수 검증 포함)로
범위 역전·음수 값을 서버 레벨에서 차단.

## pending-submit 데이터 손실 버그 수정 (2026-08-04, 코드 레벨 검증 완료 · 브라우저 실사용 테스트 대기)

로그인 게이트 실사용 검증 중 발견: 로그인 후 `PENDING_REQUEST_KEY` 자동 제출이
`createRequest()` 성공 여부와 무관하게 `localStorage.removeItem()`이 먼저 실행되는
구조였다. 실패 시(네트워크/RLS/CHECK 등) 사용자가 입력한 요청 조건이 영구히
사라지는 데이터 손실 버그였고, 로그인 경로에서는 실패해도 에러가 화면에 전혀
표시되지 않아 증상이 "로그인 후 아무 일도 안 일어남"으로만 보였다.

커밋 `a248603`(fix: preserve and validate pending requests before submission),
`fee78da`(feat: add recovery UI for failed pending requests).

**완료됨(코드 레벨 검증):**
- diff 전체 리뷰 완료
- `SESSION_REQUIRED_ERROR` 4개 위치(판정/session_required 미삭제/성공 시에만 삭제/
  invalid·expired 삭제) 계획과 실제 구현 일치 확인
- 재진입 방지(`isSubmittingPendingRef`)가 `finally`에서 항상 해제됨을 코드로 확인
- build/lint 두 커밋 각각 통과

**아직 안 된 것(브라우저 실사용 테스트):**
- CHECK 위반 강제 실패 → key 유지 → Retry 버튼 표시
- Retry 재시도 → 성공 화면 이동
- Retry 연타 시 중복 요청 방지(Network 탭 실제 확인)
- TTL 만료(savedAt 조작) → expired 안내
- legacy payload(래퍼 없음) → expired 처리
- invalid(깨진 JSON) → invalid 처리
- 회원가입 경로(handleFinish) 회귀 확인
- 4개 언어(ko/ja/zh/en) 문구 확인

다음 세션(집 PC 등)에서 이어서 진행.

## 지역 입력 구조화 (설계 조사 완료, 구현 결정 대기)

region_text 자유 입력만으로는 "망원역", "회사 근처", 지도 핀 등 서로 다른 위치
조건을 중개사 영업지역에 정확히 매칭하기 어렵다는 문제를 조사했다. **이번 조사는
설계 방향 검토와 문서화만 진행했고, 실제 stations 테이블 생성·컬럼 추가·외부 API
연동·UI 교체는 전혀 하지 않았다.** 아래 스키마는 전부 문서용 초안이다.

### 확장 방향
기존 region_text는 표시용 문구로 그대로 유지하고, 아래 구조로 확장 검토 중:
```
location_type      station | pin | text
station_id          stations.id 참조 (location_type='station'일 때만)
location_lat/lng     double precision
location_radius_m    integer  -- 아래 "역 선택 시 탐색 범위" 참고, station 전용인지
                                  station+pin 공통인지 미확정
city_code / district_code   text 또는 별도 코드 테이블 참조
```
properties 테이블에 이미 lat/lng를 직접 컬럼으로 두는 전례(migration_009/011)가
있어, 좌표를 별도 엔티티로 분리하지 않고 소유 테이블에 직접 두는 쪽이 이 프로젝트
관례에 가깝다는 참고 근거로 남긴다(다만 최종 결정은 미확정 항목 참고).

### 역 자동완성 (문서용 초안 — 실제 생성 안 함)
```sql
-- 문서용 초안 - 실제 실행하지 않음
create table stations (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null,
  name_en text,
  name_ja text,
  name_zh text,
  line text,             -- 미확정: 단일 값 vs 배열(환승역)
  latitude double precision not null,
  longitude double precision not null,
  city text not null,
  district text not null
);
```
"망원역" 선택 시: 표시는 "망원역 · 서울 6호선 · 마포구", 내부 저장은 station_id +
좌표 + district_code. region_text에는 계속 "망원역"류 표시 문자열을 같이 채워
기존 화면이 안 깨지게 한다.

### 지도 핀
회사·학교 등 역이 아닌 위치는 location_type='pin' + location_lat/lng +
location_radius_m. 지도 클러스터링 작업(위 섹션 참고)과 거리 계산 유틸을 공유할
여지가 있음 - 실제 설계 시점에 재검토.

### 역 선택 시 탐색 범위 (신규 미확정 항목)
station_id + 좌표만으로는 "망원역 선택"이 무엇을 의미하는지 불명확하다(바로 인근 /
도보 10분 / 반경 1km / 구 전체 중 무엇인지). 후보:
- A. 반경(500m/1km/2km/3km) — MVP에 더 적합할 가능성, 추가 API 불필요
- B. 도보 시간(5분/10분/15분/20분) — 실제 도로망 기반 경로 API가 필요할 수 있어
  MVP에서는 A가 더 적합한지 추후 비교 필요

이 때문에 location_radius_m을 pin 전용으로 확정하지 않는다. station과 pin이
공통으로 쓰는 범위 필드로 둘 가능성을 미확정 항목에 포함한다.

### 아직 확정되지 않은 항목 (사람이 직접 결정해야 함)
- 한 요청에 지역을 하나만 허용할지 복수 지역을 허용할지
- city_code/district_code가 행정동 기준인지 법정동 기준인지 (한국 행정구역 체계상
  이 둘이 다를 수 있음)
- 환승역처럼 하나의 역이 여러 노선에 속할 때 line을 단일 값으로 저장할지 배열로
  저장할지
- station과 pin의 반경 저장 방식 (location_radius_m을 공통 필드로 둘지 여부 포함)
- 중개사 영업지역을 구/동/역/반경 중 어떤 단위로 등록받을지 (중개사 응답 화면
  설계와 함께 결정 필요)
- 역 선택 시 반경 입력을 받을지 도보 이동시간 입력을 받을지 (위 "역 선택 시 탐색
  범위" 참고)
- 사용자가 역이 아니라 회사 이름·주소를 검색하는 경우의 지오코딩 방식(외부 API
  연동 여부 포함, 이번 조사에서 다루지 않음)
- 좌표 원본(정확한 위치)과 공개용 표시 문구(마케팅/지도 노출용 근사치)를 어떻게
  분리해서 개인정보를 처리할지 - properties.address_public의 근사 처리 방식
  (migration_011)을 참고할 수 있으나 요청서(고객 위치)는 매물 공개와 성격이
  달라 별도 검토 필요

### 선행 조건
서울 주요 역 데이터 확보(MVP는 전국이 아닌 서울 주요 역만으로 시작), 중개사
화면에서 영업지역을 어떻게 등록받을지 먼저 설계.

이번 조사 보고가 승인되면, 위 미확정 항목들에 대한 결정과 함께 "설계 완료, 구현
대기"로 상태를 갱신한다. 실제 구현은 중개사 응답 화면 설계 이후 착수한다.
