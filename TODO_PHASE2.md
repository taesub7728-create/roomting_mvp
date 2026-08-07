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

## pending-submit / 로그인 게이트 리팩터링 (2026-08-04, Phase 1-2 완료 · Phase 3 인계)

**배경**: 최초 데이터 손실 버그(로그인 후 `PENDING_REQUEST_KEY`가 `createRequest()`
성공 여부와 무관하게 먼저 삭제되던 문제, 커밋 `a248603`/`fee78da`)를 고친 뒤 이어진
분석에서 별도 문제 4개를 확인했고(설계안 승인 완료), Phase 1~4로 나눠 구현 중이다.
확정된 문제: (1) OAuth/기존 세션 로그인 경로에서 pending 제출이 누락됨 (2) 실패 시
값을 고칠 방법이 없음 (3) CHECK 위반 등 DB 원문이 화면에 그대로 노출됨 (4) 중복 제출
방지가 컴포넌트 로컬 ref뿐이라 탭 간·새로고침에 취약함.

**Phase 1 완료 (커밋 `c83ef22`)** — 문제 (1):
- `checkExistingSession()`의 nickname 보유자 즉시 redirect와 `mode==='login'`의 동기
  `<Navigate>` 가드 둘 다, `redirectForRole()` 실행 전에 기존 `submitPendingRequestIfAny()`를
  먼저 호출하도록 통합(새 공통 함수는 만들지 않음)
- `authChecking` state로 세션/pending 판단이 끝나기 전 폼이 깜빡 노출되지 않게 함
- `postAuthResolvedRef`로 두 effect가 같은 마운트에서 동시에 pending을 두 번 트리거하지
  않게 가드

**Phase 2 완료 (커밋 `31ce238`)** — 문제 (3), 문제 (1)의 UI 부작용:
- `src/api/classifySubmitFailure.js` 신설: retryable/editable/unknown 분류 순수 함수.
  Supabase 실측 기반(`code==='23514'`, constraint 이름은 `error.message` 문자열 파싱으로만
  확인 가능, `details`/`hint`는 `null`, `name`은 `undefined` - instanceof 판별 불가).
  editable은 `requests_deposit_range_consistency`/`requests_jeonse_loan_consistency`
  화이트리스트만 허용, 그 외(미등록 constraint·매치 실패·RLS 오류 등)는 전부 unknown
- 화면에서 DB 원문 완전 제거, 상태별 고정 문구+CTA만 노출(translations.js 4개 언어 15키
  추가). retryable/unknown=재시도 버튼, editable=요청서 수정 버튼(이번 Phase는 disabled)
- `showAuthEntry = !pendingStatus || pendingStatus === 'session_required'` 조건으로
  이미 인증된 사용자에게 로그인/가입 진입 UI가 pending 실패 안내와 동시에 뜨던 문제 해결
- `.rt-notice-text`(회색) 신설해 `session_required` 안내를 `.rt-error-text`(빨강)와 시각
  분리, `showAuthEntry===false`인 모든 상태에 공통 "홈으로" 이탈 버튼 추가(PENDING_REQUEST_KEY
  미삭제, `redirectForRole` 재사용)

**Phase 3 완료 (2026-08-05)** — 문제 (2) 해결. 커밋 3개:

| 커밋 | 범위 |
| --- | --- |
| `8957a61` | `.gitignore`에 `*.local.*` 추가 + 테스트 계정 정리 항목 기록 |
| `c62ad83` | `validateTransaction.js` 추출, 호출부 4곳 교체, `validateRequest()`에 전세 검증 추가 |
| `de121ed` | `restoreRequestForm()`, 임시 키 + draft 충돌 처리, editable 버튼 연결, 죽은 코드 정리, rent 안내 문구 |

구현된 내용:
- `restoreRequestForm(payload)` - `buildRequestPayload()`의 역변환. **잘못된 값을 고쳐서
  복원하지 않는다** - 0이나 범위 역전처럼 CHECK를 위반한 값도 그대로 되살린다. 이 흐름
  자체가 "제출이 거부됐으니 사용자가 고쳐야 하는" 상황이라, 조용히 정상값으로 바꾸면
  사용자는 무엇이 잘못됐는지 영영 모른다. 타입이 깨진 값만 기본값으로 대체한다.
- 전세 규칙 단일 정의: `validateTransaction.js`의 `checkJeonseAmounts()` /
  `checkJeonseLoanPlan()`. 금액과 대출 여부를 두 함수로 나눈 것은 "대출 여부는 transaction
  단계에서 막지 않고 review에서만 막는다"는 정책을 지키기 위해서다 - 합치면 step validate가
  대출 미입력까지 막아버린다.
- 복귀 단계는 `transaction`. review 직행 금지 규칙 유지. id→index 변환은
  `steps.js`의 `getStepIndex()`에서만 한다.
- editable "요청서 수정" 버튼 연결 완료.

### ⚠️ 충돌 판정 기준: `sourceSavedAt`을 쓴다 (`savedAt`으로 되돌리지 말 것)

원래 승인안은 "복원본과 기존 draft의 `savedAt`을 비교해 기존 draft가 더 최신이면 충돌
프롬프트"였다. **이 안은 작동하지 않는다.** 복원본은 사용자가 "요청서 수정"을 누른 그
순간 만들어지므로 저장 시각이 항상 기존 draft보다 최신이다. 따라서 "기존 draft가 더
최신" 분기에 영원히 도달하지 못하고, 매번 "복원본으로 교체"로 흘러 **기존 작성분을
조용히 덮어쓴다** - 정책이 명시적으로 금지한 바로 그 사고다.

그래서 복원본에 `sourceSavedAt`(= pending 래퍼의 `savedAt`, **사용자가 제출 버튼을 누른
시각**)을 따로 실어 이것과 draft의 `savedAt`을 비교한다. 판단 기준은 "제출한 뒤에
마법사에서 더 작업했는가"다.

`requestDraftStorage.js`의 `saveRestoredDraft()`에 `sourceSavedAt`을 넘기는 부분과
`RequestWizard`의 `draftIsNewer` 판정을 고칠 때는 이 문단을 먼저 읽을 것. 편의상
`Date.now()`나 `restored.savedAt`으로 바꾸는 순간 조용한 덮어쓰기가 재발한다.
`sourceSavedAt`이 없는 복원본은 판단 근거가 없으므로 덮어쓰지 않고 충돌 프롬프트를 띄운다.

### 유실 방어: localStorage 쓰기는 되읽어 확인한다

`localStorage.setItem`은 예외를 던지지 않고도 값이 남지 않는 경우가 있다(용량 초과,
일부 브라우저의 프라이빗 모드). 그래서 `writeVerified()`가 쓴 뒤 `getItem`으로 되읽어
비교하고, 이 확인이 통과했을 때만 원본(`PENDING_REQUEST_KEY` 또는 임시 키)을 지운다.
`promoteRestoredToDraft()`도 draft 쓰기 성공 후에만 임시 키를 정리한다 - 순서가 뒤바뀌면
쓰기 실패 시 양쪽 모두 사라진다.

### 충돌 프롬프트: 두 버튼 모두 "선택"

기존 `draftPrompt` 오버레이를 `kind: 'resume' | 'conflict'`로 분기해 재사용했다.
conflict에서는 `handleDiscardDraft`(삭제 동작)를 쓰지 않는다 - 두 버튼 모두 선택이고,
한쪽을 고르면 다른 쪽이 사라진다는 사실을 설명 문구(`draftConflictDesc`)로 명시한다.

### 판단 보류였던 3건 처리 결과 (2026-08-05 결정)
- `validateRequest()`에 전세 검증 추가 → **추가함**. 규칙은 `validateTransaction.js`에서
  공통화해 `steps.js`와 중복 하드코딩하지 않는다.
- 단위 테스트 프레임워크(vitest 등) 도입 → **보류**. 이번 범위에서 제외한다. 검증은
  일회성 node 스크립트로 대신했고 저장소에 남기지 않았다. `classifySubmitFailure()`와
  `checkJeonseAmounts()`/`restoreRequestForm()` 모두 순수 함수라 나중에 붙이기 쉽다.
- rent 원값 복원 불가 → **안내 문구로 처리**. 별도 복원 로직은 만들지 않았다. 복원본에
  `rentFallbackApplied` 플래그를 실어, 사용자가 거래유형을 실제로 바꾸는 순간에만
  `rentRecheckNotice`를 노출한다(4개 언어).

### 추출 과정에서 함께 닫은 기존 결함 3건 (`c62ad83`)
1. `TransactionStep`의 `rangeInvalid`가 `dealType`을 보지 않아 월세일 때도 true가 될 수
   있었다(전세 입력칸이 렌더되지 않아 화면에 나온 적은 없는 죽은 계산).
2. 전세에서 최대=0, 최소>0일 때 "최소 금액은 최대 금액보다 클 수 없어요"가 떠서 진짜
   원인(최대가 0)을 잘못 지목했다.
3. `DEPOSIT_MAX_NOT_POSITIVE`/`DEPOSIT_MIN_NOT_POSITIVE`에 인라인 문구가 없어 사용자가
   이유를 모른 채 "다음"에서 막혔다. 5개 이슈 코드 전부에 문구를 매핑했다
   (`DEPOSIT_MAX_MISSING`만 빈 폼이므로 인라인 무표시, 제출 게이트에서는 문구 반환).

### pending 제출 race condition 수정 (`544dd4d`, 2026-08-05)

브라우저 실사용 검증에서 발견했다. 신규 이메일 로그인 시 pending 제출이 실패해도
그 안내가 뜨지 않고 홈으로 리다이렉트되어, **Phase 2·3에서 만든 오류 복구 UI 전체가
가장 흔한 경로에서 도달 불가능**했다.

근본 원인은 `submitPendingRequestIfAny()`가 재진입 시 `'none'`을 돌려준 것이다.
`'none'`은 "PENDING_REQUEST_KEY 없음"과 뜻이 겹쳐서, 받는 쪽이 "할 일 없음"으로 읽고
`redirectForRole()`을 실행했다.

**절대 되돌리면 안 되는 것 3가지** (되돌리면 같은 버그가 재발한다):

1. **진행 중(flight) 확인이 키 확인보다 먼저다.** 순서를 뒤집으면, 진행 중인 제출이
   성공하며 키를 지운 직후 도착한 호출부가 `'none'`을 받아 성공 화면 위로 redirect한다.
2. **`force`는 사용자가 직접 누른 재시도에만 쓴다.** 자동 경로에도 열어주면 결과 해석이
   여러 번 일어나 다시 경쟁이 된다. 반대로 재시도에서 빼면 사용자의 명시적 재시도
   결과가 무시된다.
3. **`mountedRef`는 effect 본문에서 `true`로 되돌린다.** `useRef(true)` 초기값만 두면
   StrictMode가 effect를 정리한 뒤 계속 `false`로 남아, 실제 마운트 상태인데도 모든
   콜백이 무시된다.

`redirectForRole`은 이제 `handlePendingResult()`의 `onNoPending` 콜백 안에만 존재한다.
새 호출부를 추가할 때 이 함수를 거치지 않고 직접 navigate하면 경쟁이 되살아난다.

### ⚠️ 미해결: `/request` 마운트 effect가 멱등하지 않다 (2026-08-05, 이번엔 수정 안 함)

`RequestWizard`의 마운트 effect는 복원본을 읽어 draft로 옮기고 임시 키를 지우는 등
localStorage를 **변경**한다. 따라서 같은 마운트에서 effect가 두 번 실행되면 두 번째
실행은 첫 번째가 바꿔놓은 저장 상태를 보게 되어 다른 판단을 내린다.

실제 관측: 개발 환경 StrictMode의 effect 재실행 시, 복원본을 자동 채택한 직후
"작성 중인 요청서가 있습니다"(resume) 프롬프트가 뜬다. 첫 실행이 복원본을 draft로
옮기고 임시 키를 지웠기 때문에, 두 번째 실행에는 "복원본 없음 + draft 있음"으로 보인다.

**프로덕션 빌드에서는 재현되지 않는다**(dev/prod 직접 대조 확인). 다만 재현되지
않는다는 이유로 안전하다고 확정하지 않는다 - effect가 저장 상태를 변경하는 구조
자체가 React의 effect 계약(재실행에 견뎌야 함)에 어긋나며, 향후 라우팅 변경이나
Fast Refresh로 리마운트가 생기면 드러날 수 있다.

추후 멱등화가 필요하다. 방향은 "판단(읽기)과 반영(쓰기)을 분리해 쓰기를 한 번만
일어나게 하거나, 이미 처리했음을 나타내는 표식을 저장 상태에 남기는 것" 정도로
검토한다. 이번 작업 범위에서는 수정하지 않았다.

### 승인 범위 밖이었지만 함께 변경한 것 3건
- **`formDefaults.js` 신설** - `DEFAULT_FORM`을 `RequestWizard.jsx`에서 분리. 분리하지
  않으면 `RequestWizard → restoreRequestForm → RequestWizard` 순환 import가 된다.
  값은 그대로이고 위치만 옮겼다.
- **`requestDraftStorage.js` 신설** - draft 저장/로드 로직을 `RequestWizard.jsx`에서
  분리. 복구 흐름에서 SignUp도 draft를 써야 하는데, 저장 포맷
  (`{version, savedAt, draft, currentStep}`)을 SignUp이 직접 알게 되면 같은 포맷 지식이
  두 파일에 생긴다. 포맷을 아는 곳을 하나로 묶고 바깥에는 의미 단위 함수만 노출한다.
- **`.rt-notice-text`를 `SignUp.css` → `theme.css`로 이동** - 다른 `rt-*` 공용 클래스는
  전부 `theme.css`에 있는데 이것만 Phase 2에서 `SignUp.css`에 들어가 있었다. 이번에
  RequestWizard가 두 번째 소비자가 되면서 제자리로 옮겼다. 스타일 값은 동일.

**브라우저 실사용 검증 완료 (2026-08-05, 프로덕션 빌드 + 실계정)**

Phase 1~3의 주요 경로를 실제 브라우저에서 검증했다. 검증 스크립트는 일회성이라
저장소에 남기지 않았다. 확인된 항목:

- 충돌 프롬프트 4개 언어 렌더(카드 높이 193~256px, 375px 뷰포트에서 넘침 없음),
  두 버튼 선택 동작과 임시 키 정리
- 전세 인라인 검증 문구 4개 언어, 빈 폼 무표시 유지
- 복원 흐름: 잘못된 값 보존 → 인라인 에러 → 수정 후 진행 가능
- `rentRecheckNotice`가 거래유형 전환 시에만 노출
- pending 상태별 화면: editable / success / retryable / session_required
- 경쟁 상황(로그인 effect + 버튼 동시)에서 `createRequest` 1회, navigate 1회
- 재시도 연타 시 중복 제출 없음(요청 중 버튼 비활성)
- DB 원문이 화면에 노출되지 않음
- "홈으로" 이동 목적지와 pending 키 보존
- 기존 resume 프롬프트 회귀

**아직 미검증인 경로**

- **`finishAfterAuth`(신규 가입 / finalizeMode)**: 검증하려면 계정을 새로 만들어야 해서
  CLAUDE.md 11번(테스트 계정 생성은 승인 필요)에 걸린다. 코드 추적으로만 확인했다.
  확인해야 할 것은 "success일 때 `setDone(true)`로 완료 오버레이가 상세 화면 위에
  겹치지 않는가"다(`handlePendingResult()` 반환값으로 판별하도록 구현돼 있음).
- **OAuth 경로**: 소셜 로그인 키가 설정돼 있지 않아 경로 자체를 재현할 수 없다.

**→ 위 두 가지는 소셜 로그인 키 연동 작업과 묶어서 진행한다.** 둘 다 실제 계정이
있어야 검증되는데, Phase 3용 테스트 계정은 이미 삭제했고 계정을 미리 만들어 두지
않는 것이 원칙이다. 키 연동을 하는 시점에 `+test` 표식을 붙인 계정을 새로 만들어
OAuth·`finishAfterAuth`를 한 번에 검증하고, 끝나면 바로 정리하는 편이 효율적이다.
그 전까지는 미검증으로 남긴다.
- `invalid` / `expired` 상태 화면은 실제 렌더 미확인(로직은 node 스크립트로 검증).
- 4개 언어 렌더는 마법사 쪽만 확인했고 SignUp의 pending 상태 문구는 ko만 확인했다.

**기존 이월 항목 (여전히 미검증)**
- Chat.jsx / ProfileMissingError.jsx 4개 언어 렌더(위 "다국어 검증 미완료" 섹션)
- open 요청서 직행 실계정 검증(위 "Splash/Onboarding" 섹션)

**테스트 계정 정리 — 완료 (2026-08-05)**
- Phase 1~3 브라우저 실사용 테스트용으로 만들었던 customer 테스트 계정 1개(2026-08-04
  생성)를 **삭제 완료**했다. 검증 과정에서 생성한 `requests` 행 1건
  (`region_text='phase3-verify'`)도 **삭제 완료**. 남은 정리 대상 없음.
- 자격증명을 적어둔 로컬 메모 파일은 2026-08-05에 삭제했다. 그 파일은 스스로
  "`*.local` 패턴으로 gitignore 처리됨"이라고 적고 있었지만 실제로는 무시되지 않는
  상태였다(`*.local`은 `.local`로 끝나는 파일만 매치). 커밋된 이력이 없음을
  `git log --all`로 확인했고, 재발 방지를 위해 `.gitignore`에 `*.local.*` 패턴을 추가했다.

**앞으로 테스트 계정을 만들 때의 원칙**

> ⚠ 이 원칙(특히 "검증이 끝나면 바로 정리")은 **새로 만든 계정에만** 적용된다.
> 022~032 검증은 **기존 계정 4개를 그대로 쓰므로 삭제 대상이 아니다.**
> 아래 「검증용 계정·데이터」 섹션의 삭제 금지 규칙이 우선한다.

- 미리 만들어 두지 않는다. 필요해지는 시점에 만들고, 그 검증이 끝나면 바로 정리한다.
- 이메일에 **`+test` 표식**을 붙인다(예: `<주소>+test<번호>@<도메인>`). 나중에 대시보드에서
  검색해 남은 계정을 한 번에 찾아 정리할 수 있게 하기 위함이다.
- 자격증명은 저장소 안 어디에도 적지 않는다. 이 저장소는 public이고, `.gitignore`를
  믿기 전에 `git check-ignore -v <파일>`로 실제 무시 여부를 확인한다.
- 테스트 계정 생성은 CLAUDE.md 11번에 따라 사용자 승인이 필요한 작업이다.

**이월(TODO): 서버 측 idempotency**
- `requests.client_submission_id` UUID 컬럼 + UNIQUE 제약으로 서버 idempotency 도입 검토
  (migration 필요 - CLAUDE.md 2번 규칙상 별도 분석·승인 대상, Phase 3와 별개로 처리)
- 현재 `isSubmittingPendingRef`/`postAuthResolvedRef`는 컴포넌트 인스턴스 내에서만 중복
  차단 가능
- 미방지 시나리오: 다중 탭 동시 제출 / 페이지 리마운트·새로고침 / INSERT 성공 후 응답 유실
  뒤 재시도
- 기존 행은 nullable UUID로 migration 가능(Postgres는 다중 NULL을 unique 위반으로 보지
  않음 - 별도 백필 불필요)
- 감수하는 위험: 중복 `requests` 행 1건, 금전·개인정보 영향 없음, 고객 본인이 `closeRequest()`로
  또는 관리자가 `listAllRequests()`로 수동 정리 가능

**Phase 3 종료 (2026-08-05).** 구현·브라우저 검증·테스트 데이터 정리까지 끝났다.

이 섹션에서 넘어가는 것은 세 가지뿐이다:
1. `finishAfterAuth`·OAuth 검증 → 소셜 로그인 키 연동 작업과 묶어서 진행(위 참고)
2. `/request` 마운트 effect 멱등화 → 별도 항목으로 위에 기록
3. 서버 측 idempotency(`client_submission_id`) → 아래 이월 항목, migration 필요라 별도 승인 대상

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

---

# 지역 입력 구조화 + 중개사 라우팅 (2026-08-06, 설계 확정 · migration 파일 작성 완료 · 미적용)

migration 022~032 파일을 작성했고 **아직 하나도 적용하지 않았다**. 아래는 이 설계 과정에서
"이번 범위에서 하지 않기로 한 것"의 전체 목록이다.

**이 목록을 지금 남기는 이유**: 시간이 지나면 각 항목이 "빠뜨린 것"인지 "판단해서 보류한 것"인지
구분할 수 없게 된다. 구현이 끝나면 각 항목을 실제 결과로 다시 갱신한다.

각 항목 형식: 현재 상태 / 제외 이유 / 감수하는 위험 / 재검토 조건 / 관련 위치

---

## 1. 5개 제한 동시성 — RLS WITH CHECK의 한계

- **현재 상태**: 설계 확정, 구현·운영 검증 전
- **제외 이유**: 슬롯 컬럼 + 부분 unique index로 완전 차단할 수 있으나, 슬롯 배정 로직이
  필요하고 공개 매물(`request_id is null`)과 어색하게 얽힌다. RLS `WITH CHECK` +
  SECURITY DEFINER 헬퍼는 migration_018의 `is_pending_realtor_applicant()`와 같은
  기존 패턴이라 새로 배울 것이 없다.
- **감수하는 위험**: 같은 중개사가 두 탭에서 동시에 INSERT하면 각각 count=4를 읽어 6개가
  될 수 있다. 피해는 매물 1개 초과에 그치고 admin이 정리 가능하다.
  Phase 3에서 `client_submission_id`를 보류하며 감수한 것과 같은 성격이다.
- **재검토 조건**: 실제로 5개 초과 행이 관측되면. 또는 제한 개수를 과금과 연동할 때.
- **관련 위치**: `migration_031_multi_property_response.sql` 2번,
  `migration_029_realtor_request_rpc.sql`의 `realtor_response_count()`

## 2. 영업지역 가입 폼 UI

- **현재 상태**: 컬럼(`realtor_applications.desired_district_codes`)만 준비. UI 미구현
- **제외 이유**: 가입 폼이 이미 필수 항목 11개라 12번째를 추가하면 이탈이 늘어난다.
  초기 중개사 수가 적어 admin이 승인 화면에서 등록증 소재지를 보고 직접 지정하는 편이 싸다.
- **감수하는 위험**: 중개사 수가 늘면 admin 부담이 선형 증가한다.
- **재검토 조건**: 승인 대기가 쌓이기 시작하면. 컬럼이 이미 있으므로 UI만 붙이면 된다.
- **관련 위치**: `migration_028_realtor_service_areas.sql` 2번, `RealtorSignUp.jsx`

## 3. check_landline_duplicate 열거 오라클

- **현재 상태**: 미해결. 이번 범위에서 손대지 않음
- **제외 이유**: 가입 전(세션 없음) 호출이라는 실제 요구가 있어 지금 닫을 수 없다.
  지역 라우팅과도 무관하다.
- **감수하는 위험**: 인증 없이 임의의 유선전화번호를 넣어 "이 업체가 룸팅에 가입했는지"를
  true/false로 확인할 수 있다. 공개된 중개사무소 전화번호 목록만 있으면 전수 조사가 가능하다.
  개인정보가 아니라 사업자 가입 여부가 새는 것이라 피해 규모는 제한적이다.
- **재검토 조건**: 경쟁사 조사 정황이 보이거나 중개사 수가 마케팅상 민감해질 때.
  대응 방향 (a) 계정 생성 직후 검사로 이동해 인증 뒤로 넘기기 (b) Edge Function으로 rate limit
- **관련 위치**: `migration_014_realtor_application_fields.sql`, `realtorApplication.api.js:6`

## 4. migration 031은 실질적으로 되돌릴 수 없다

- **현재 상태**: 설계 확정, 미적용
- **제외 이유**: `properties_request_realtor_unique`(migration_007)를 drop해야 다중 매물이
  가능한데, 되돌리려면 초과 행을 먼저 지워야 하고 `chat_rooms`가 cascade로 함께 사라진다.
- **감수하는 위험**: 롤백 시 대화 기록 소실. Supabase Free 플랜에는 자동 백업이 없다
  (일일 백업은 Pro 이상, PITR은 유료 애드온).
- **재검토 조건**: 적용 전 `properties` / `property_images` / `chat_rooms` / `chat_messages`
  4개 테이블 백업이 반드시 선행되어야 한다. 백업 없이 적용하지 않는다.
- **관련 위치**: `migration_031_multi_property_response.sql` 헤더

## 5. extra_note 개인정보 — 경감 조치이지 해결이 아니다

- **현재 상태**: 설계 확정(300자 제한 + 연락처 패턴 경고 + 안내 문구), 미구현
- **제외 이유**: "목록에서는 일부만, 상세에서 전체" 방식은 채택하지 않았다. 중개사가 매물을
  고르려면 목록에서 이미 내용을 봐야 하기 때문이다.
- **감수하는 위험**: **자유 입력인 이상 개인정보가 중개사에게 전달될 가능성은 남는다.**
  세 조치는 노출 "가능성"을 줄일 뿐이다. **"보호 완료"로 취급하지 말 것.**
- **재검토 조건**: 실제 유출이 관측되면 (a) 응답 전 마스킹 (b) 구조화 입력 전환을 검토.
- **관련 위치**: `migration_032_request_constraints.sql` 2번, `RequestWizard/ExtraStep.jsx`

## 6. 구버전 클라이언트 호환 전략 (Capacitor 대비)

- **현재 상태**: 미설계
- **제외 이유**: 지금은 웹 전용이라 새로고침으로 해결된다. 023 적용은 사용량 최저 시간대에
  하고, Chat에 무반응 방어를 넣는 것으로 대응한다.
- **감수하는 위험**: 023 적용 직후 구버전 번들 탭에서 Chat 메시지 전송이 **에러 없이 무시**된다.
  PostgREST의 embedded join은 RLS로 걸리면 에러가 아니라 null을 반환하기 때문이다.
  ResponseStatus는 이름이 "공인중개사"로 대체되는 정도로 우아하게 열화된다.
  **Capacitor 앱이 나오면 구버전 앱이 몇 주 남을 수 있어 DB 정책을 즉시 잠글 수 없다.**
- **재검토 조건**: 앱 출시를 결정하는 시점. 강제 업데이트 게이트(최소 지원 버전) 또는
  API 버저닝(구버전용 RPC 한시 유지)이 정책 변경보다 먼저 필요하다.
  웹에서도 `/version.json` 폴링 + 새 배포 배너를 검토할 수 있다.
- **관련 위치**: `migration_023_profiles_lockdown.sql` "적용 전 확인" 섹션

## 7. 중개사 공개 프로필 (사진 / 자기소개 / 소통 가능 외국어)

- **현재 상태**: 구조만 판단 완료. 아무 컬럼도 추가하지 않음
- **제외 이유**: 지금 필요하지 않고, 개념(어느 언어를 어떻게 검증할지)이 미확정이다.
- **판단 결과**: `profiles`가 아니라 **별도 테이블 `realtor_public_profiles`**가 맞다.
  결정적 근거는 RLS다 - 이 필드들은 고객에게 공개돼야 하는데 `profiles`에 넣으면
  023에서 own+admin으로 잠근 정책을 다시 열어야 하고 그러면 `phone`이 같이 열린다.
  별도 테이블이면 그 테이블만 공개 읽기로 열고 `profiles`는 닫힌 채로 둘 수 있다.
  `realtor_applications`(사업자등록번호·서류 경로가 있는 심사용 민감 테이블)와는 성격이
  달라 CLAUDE.md 3번의 "유사 테이블 남발"에 해당하지 않는다.
- **감수하는 위험**: 없음(아무것도 만들지 않았으므로)
- **재검토 조건**: 중개사 차별화 요구가 생기거나 외국어 매칭을 실제로 붙일 때
- **관련 위치**: 아래 8·9번과 함께 검토

## 8. 소통 가능 외국어 매칭은 "필터"가 아니라 "가점"

- **현재 상태**: 설계 방향만 확정. 미구현
- **제외 이유**: 7·9번이 선행되어야 한다.
- **판단 결과**: 사용자 전원이 외국인은 아니고 한국어 요청서도 들어오므로 필터로 만들면
  한국어 요청서가 특정 중개사에게 보이지 않는 부작용이 생긴다.
  `list_open_requests_for_realtor()`의 **`order by`만 바뀌고 반환 컬럼은 그대로**라
  `create or replace`로 무중단 교체가 된다. 비용이 낮다.
    order by (case when r.written_language in ('ja','zh','en')
                    and r.written_language = any(rp.spoken_languages) then 0 else 1 end),
             r.created_at desc
- **감수하는 위험**: 없음
- **재검토 조건**: 외국어 요청서 비중이 유의미해질 때
- **관련 위치**: `migration_029_realtor_request_rpc.sql` 1번 함수

## 9. requests.written_language (작성 시점 언어 스냅샷)

- **현재 상태**: 미추가. 비용만 확인
- **제외 이유**: 8번이 확정되기 전에는 쓸 곳이 없다. 미래 컬럼을 미리 넣지 않는다는
  기존 원칙(location_type CHECK)과 일관되게 지금은 만들지 않는다.
- **확인한 사실**: `requests`에 언어 컬럼이 **없다.** 유추 가능한 것은
  `profiles.preferred_language`뿐인데 이건 작성 시점이 아니라 현재 설정이고
  `updatePreferredLanguage()`로 언제든 바뀐다. 요청서를 일본어로 쓴 뒤 한국어로 바꾸면
  유추가 틀린다.
- **비용**: 컬럼 1개 + `createRequest()`에 lang 전달 + `buildRequestPayload()` 한 줄.
  `region_text`가 이미 작성 시점 언어의 표시 문자열이라 같은 지점에서 함께 저장하면 된다.
  기존 행 백필은 `preferred_language` 근사 또는 null. **낮다.**
- **재검토 조건**: 8번을 실제로 구현할 때
- **관련 위치**: `requests.api.js:31`, `buildRequestPayload.js`

## 10. 022 반환 컬럼 확장에는 함수 교체(v2)가 필요하다

- **현재 상태**: 제약 사항으로 인지. 지금 조치 없음
- **확인한 사실**: `returns table(...)`에 컬럼을 추가하는 것은 `create or replace`로
  **불가능하다**(반환 타입 변경 불허). `drop function` 후 재생성해야 하고 그 찰나에
  프론트 호출이 실패한다.
- **감수하는 위험**: 없음. 다만 7번(중개사 프로필)을 붙일 때 "컬럼 하나 추가"가 아니라
  "함수 교체"라는 점을 모르면 무중단 배포 계획이 어긋난다.
- **재검토 조건**: 7번 구현 시. `list_request_responses_for_customer_v2`를 새로 만들고
  프론트 전환 후 구함수를 삭제한다(022/023과 같은 무중단 패턴).
  지금 jsonb 확장 슬롯을 미리 넣는 방식은 "미래 컬럼 미리 넣기"와 같은 안티패턴이라 쓰지 않는다.
- **관련 위치**: `migration_022_profiles_relation_rpc.sql` 1번 함수

## 11. 중개사무소 다중 담당자 (office_id) — DB 변경 보류

- **현재 상태**: 비용 검토만 완료. **아무 컬럼도 추가하지 않음**
- **확인한 사실**:
  1. 현재 `profiles.id` 기반 realtor 모델은 사무소와 개인이 뭉개져 있다.
     `nickname`=업체명인데 `realtor_applications.contact_name`/`contact_phone`은 담당자 개인이다.
     계정 1개 = 사무소 1개 = 담당자 1명.
  2. `realtor_service_areas`는 **사무소 귀속이 맞다**. 등록증 소재지 기반이라 실장별로
     다른 영업지역은 부자연스럽다. 도입 시 `realtor_id` -> `office_id`로 옮겨야 한다.
  3. `properties.realtor_id`는 현재 사무소/담당자 구분이 없다. 다중 담당자가 되면
     **둘 다 필요**하다 - 책임 주체(사무소)와 작성자(담당자). `chat_rooms.realtor_id`는 담당자여야 한다.
  4. 과금을 사무소 단위로 바꿀 때 백필은 **기존 realtor profiles 1행당 offices 1행(1:1)**이라
     결정론적이고 손실이 없다. 비용이 낮다.
- **제외 이유(5번 질문에 대한 답)**: 백필이 1:1이라 나중에 해도 비용이 거의 같다.
  개념(과금 단위 / 담당자 초대 흐름 / 사무소 소유자 / 퇴사 처리)이 미확정이라
  `office_id`를 **어느 테이블에 다는지조차** 정할 수 없다. 미사용 nullable 컬럼은
  "있는데 안 쓰는" 상태로 남아 다음 사람이 의미를 오해한다.
- **감수하는 위험**: 없음
- **재검토 조건**: 사무소에 실장이 여러 명인 중개사가 실제로 들어올 때. 또는 과금 설계 시작 시.
- **관련 위치**: `migration_028_realtor_service_areas.sql`, `schema.sql` profiles/properties

## 12. 매매(deal_type = 'sale') 확장

- **현재 상태**: 미착수
- **제외 이유**: enum 값 추가 자체는 간단하지만 금액 단위·대출 항목·검토 항목이 임대차와
  전부 달라 화면과 검증이 따라와야 한다. 초기 타깃인 외국인 사용자는 매매를 거의 하지 않는다.
- **감수하는 위험**: 없음
- **재검토 조건**: **내국인 시장 진입 시점.** 역 마스터(024~026)와 라우팅 구조(028~030)는
  그대로 재사용되므로 이번 작업이 매매 확장을 막지 않는다.
  주의: `ALTER TYPE ADD VALUE`는 같은 트랜잭션에서 새 값을 쓸 수 없어 migration을 두 번 나눠야 한다.
- **관련 위치**: `migration_021_deal_type_jeonse_fields.sql`, `RequestWizard/steps/TransactionStep.jsx`

## 13. 에이전트(care_agent) 권한 범위 미확정 — 제품 결정 필요

- **현재 상태**: 구조와 문서가 어긋나 있음. 이번 범위에서 바꾸지 않음
- **확인한 사실**:
  - `createRequest()`는 항상 `created_by = customer_id = user.id`로 채운다. 에이전트가 남을
    대신 작성하는 UI는 없다(`requests.api.js:8-9` 주석에 "이후 단계" 명시).
    **따라서 오늘 기준으로 `created_by` 조건은 추가 권한을 한 건도 주지 않는다.**
  - 그런데 기존 정책 4곳이 이미 `r.created_by = auth.uid()`로 응답 열람까지 허용한다
    (`policies.sql:61, 79, 97`, `migration_009:47`, `migration_010:37`).
  - `README.md:19`는 에이전트를 "고객을 대신해 조건 요청서 **작성** 가능"으로만 설명한다.
  - `care_agent` role은 전용 화면이 없다. `homePathForRole()`과 `RealtorRoute` 모두
    default로 `/coming-soon`에 보낸다.
- **감수하는 위험**: 대리 작성 기능을 실제로 만드는 순간, 에이전트가 고객의 응답 매물과
  예산 조건까지 계속 열람하게 된다. 지금은 코드 경로가 없어 발현되지 않는다.
- **재검토 조건 (결정 시점 명시)**: **에이전트 대리 작성 UI 작업을 시작하기 전, 설계 단계에서
  결정한다.** 구현을 시작한 뒤로 미루면 `customer_id`를 선택하는 UI를 만든 순간부터
  권한이 발현되므로, "만들면서 정하자"가 성립하지 않는다.
  구체적으로는 `createRequest()`에 `customerId` 파라미터를 추가하는 커밋 이전이 마지막 시점이다.
    - "작성만 대행"으로 정하면 -> `policies.sql:61, 79, 97`, `migration_009:47`,
      `migration_010:37`, 022 RPC 총 6곳에서 `created_by` 조건을 함께 좁힌다.
    - "응답 관리까지"로 정하면 -> `README.md:19`를 고쳐 문서와 구조를 일치시킨다.
  어느 쪽이든 이번 작업에서 만든 022 RPC 주석도 함께 갱신한다.
- **관련 위치**: `migration_022_profiles_relation_rpc.sql` 1번 함수 주석, `policies.sql`

## 14. 신촌 백필은 추정값이다

- **현재 상태**: 백필 미실행. 값은 추정으로 확정
- **확인한 사실**: 신촌역은 2호선(서울교통공사)과 경의중앙선(코레일) 두 개가 별개로 존재한다.
  약 400m 거리이고 공식 환승 관계가 아니라 시드 병합 규칙에서 자동 병합되지 않는다.
- **감수하는 위험**: **사용자가 어느 신촌역을 의도했는지 확정할 수 없다.**
  운영상 기본값으로 2호선 신촌역을 쓴다(통칭 "신촌"이 가리키는 대상, 이용객 규모).
  두 역 모두 서대문구라 `district_code`가 같아 **라우팅 결과는 동일하다.**
  이 값을 근거로 다른 판단(예: 역별 수요 통계)을 하지 말 것.
- **재검토 조건**: 해당 요청서가 실제로 응답을 받고 고객과 대화가 이뤄질 때 확인 가능.
- **관련 위치**: `migration_027_requests_location.sql` "백필 계획" 섹션,
  `scripts/seed-stations/merge_report.csv`

## 15. 트리거 함수 EXECUTE 회수는 실측이 필요하다

- **현재 상태**: migration에 포함. **검증 전**
- **확인 필요 사항**: PostgreSQL은 트리거 실행 시 함수 EXECUTE 권한을 재검사하지 않고
  `CREATE TRIGGER` 시점에 검사한다고 알려져 있으나, 이 프로젝트에서 실측한 적이 없다.
- **감수하는 위험**: 틀리면 `handle_new_user` revoke는 **회원가입을 통째로 죽이고**,
  `prevent_realtor_nickname_change` revoke는 **profiles UPDATE 전체를 막아** 언어 변경과
  승인까지 죽는다.
- **재검토 조건**: 023 적용 후 T31~T34, 030 적용 후 T16을 반드시 실제로 돌린다.
  실패하면 해당 revoke 줄만 되돌린다. **검증 없이 확정하지 않는다.**
- **관련 위치**: `migration_023_profiles_lockdown.sql` 2번,
  `migration_030_secure_requests_access.sql` 4-2

## 16. profiles nickname 트리거의 알려진 한계 2가지

- **현재 상태**: 설계 확정, 한계 인지
- **한계 (a)**: 승인 **전**에 바꿔둔 nickname은 그대로 고정된다.
  admin이 승인 화면에서 업체명·등록증을 보고 있어 그 시점에 걸러지고, 이상하면 나중에 고칠 수 있다.
- **한계 (b)**: 제3자가 남의 nickname을 바꾸는 경우는 이 트리거가 막지 않는다.
  `profiles_update_own`(auth.uid()=id 또는 admin)이 이미 막고 있어 실질 취약점은 없지만,
  **방어가 두 겹에서 한 겹으로 줄어든다.**
- **재검토 조건**: 사무소명 사칭이 실제로 관측되면 승인 시점의 검증된 `company_name`을
  별도 공개 필드에 고정하는 방식(B안)을 재검토한다.
- **관련 위치**: `migration_023_profiles_lockdown.sql` 2번
---

# ⚠ Known Bug — 중개사 가입이 이메일 확인 설정에서 막힌다

**분류: Known Bug / 외부 중개사 모집 전 필수 수정. Later 아님.**

**2026-08-07 확인: 현재 Confirm email은 꺼짐(disabled) 상태라 미발현.**
**토글을 켜기 전 반드시 이 버그부터 수정한다.** (위치: Authentication → Sign In / Providers →
Supabase Auth 탭 → User Signups 섹션)

- **재현**
  1. `/signup/realtor`에서 지원서 제출
  2. 프로젝트의 "Confirm email"이 켜져 있으면 `signUpWithEmail()`이 세션 없이 반환되어
     `awaitingEmailConfirm` 화면으로 종료된다. **이 시점에 지원서는 저장되지 않는다.**
  3. 화면 문구는 "파트너 로그인으로 다시 로그인하면 서류 제출을 이어갈 수 있어요"라고 안내한다
  4. 인증 메일 링크 클릭 후 `/login/realtor`로 로그인 → `/realtor`로 이동
  5. `RealtorRoute`가 `role='customer'` + 지원서 없음으로 판정 → `/`로 리다이렉트
  6. `/signup/realtor`로 되돌아가 다시 제출하면 `signUpWithEmail()`이
     "이미 등록된 이메일"로 실패 → **막다른 길**

- **영향**: 테스트 편의 문제가 아니다. **Confirm email이 켜진 운영 환경에서 실제 중개사 가입이
  차단된다.** 화면이 존재하지 않는 경로를 안내하고 있어 사용자는 자기가 뭘 잘못했는지 알 수 없다.

- **임시 대응 (지금은 불필요)**: 원래는 중개사 테스트 계정을 새로 만들 때만 Confirm email을
  비활성화하고 직후 원복하는 방식이었다. 2026-08-07 현재 토글이 이미 꺼져 있고 **기존 계정을
  재사용하기로 해서 신규 중개사 가입 자체가 없다.** 앞으로 토글을 켠 뒤 중개사 가입을 다시
  테스트해야 할 때는, 끄고 → 가입 → **즉시 원복** 순서로 하고 원복을 화면에서 다시 확인한다.
  이건 테스트 편의책이지 운영 대응책이 아니다.

- **근본 해결 후보**
  - 인증 후 지원서 작성 재개 경로 구현 (로그인 상태 + 지원서 없음 → 지원서 폼으로 유도)
  - pending onboarding 상태를 localStorage 등에 저장했다가 로그인 후 이어받기
  - 기존 계정이면 `signUpWithEmail()` 재호출 없이 세션 확인 후 지원서 단계로 바로 이동
    (`RealtorSignUp.handleSubmit()`이 항상 가입부터 시도하는 구조를 분기)

- **우선순위**: **11월 중개사 방문 영업 시작 전 필수.**
  현장에서 그 자리에 가입시키려다 막히면 즉시 신뢰를 잃는다.

- **관련 위치**: `RealtorSignUp.jsx:66-71`(awaitingEmailConfirm 분기), `:102-153`(login 모드),
  `shared/routes/RealtorRoute.jsx:43-47`(customer 분기)

- **처리 시점**: 022~032 작업이 끝난 뒤 별도 항목으로 다룬다. 지금 고치지 않는다.

---

# 진행 상태 (2026-08-07 기준)

## 완료
- **migration 022 적용 완료** — `list_request_responses_for_customer()`,
  `get_chat_participants()` 두 RPC 생성. 정책 변경 없음.
  - ACL 확인 통과: `postgres=X | authenticated=X | service_role=X`
  - **PUBLIC(`=X/postgres`)과 anon 없음** → revoke 정상 적용
  - `service_role=X`는 Supabase default privileges가 자동 부여한 것이며
    서버 전용 키라 RLS를 어차피 우회한다. 정상으로 판단.
  - `security_definer=true`, `config={"search_path=pg_catalog, public"}` 확인
- **migration 023~032 파일 작성 완료. 전부 미적용.**
- 타입 사전 확인 완료: `profiles.preferred_language`=text,
  `properties.room_type`=USER-DEFINED/room_type, `deposit`/`monthly_rent`/`sort_order`=integer,
  `created_at`=timestamptz → 022 선언과 일치, 수정 없이 적용함
- admin 계정 확인: `nickname='dada'`, `id=00d6aa35-d64b-43fd-a659-a2f4af23fabc`
- **Step 0② 완료** — Confirm email 설정 확인. **꺼짐(disabled) 상태.**
  위치: Authentication → Sign In / Providers → Supabase Auth 탭 → User Signups 섹션
  → `awaitingEmailConfirm` Known Bug는 현재 미발현 (토글 켜기 전 반드시 수정, 위 Known Bug 항목 참고)
- **테스트 계정 신규 생성 취소 (2026-08-07 결정)** — 필요한 역할 4종이 기존 계정에 이미
  전부 있어서 `+test1~3` 계정을 만들지 않기로 했다. 아래 「검증용 계정·데이터」 참고.
- **관계 데이터 생성 완료 (2026-08-07)** — 요청서 `cc193972-...`(신촌) ← `aaa@naver.com`의
  응답 매물 `dz`(`c8ab5299-...`) ← 채팅방 `a325fc9a-...` + 양방향 메시지. 023 전 기준선 확보.
  ResponseStatus 중개사 이름 `베스트공인중개사사무소` 표시 확인.
  ※ 이 요청서의 `response_deadline`은 테스트용으로 7일 연장한 상태다(원복은 승인 후).
- **Step 7 스모크 테스트 통과 (2026-08-07)** — S1~S4 전부 기대대로. 상세는 아래 Step 7 섹션.

## 다음 단계 (이 순서대로) — 다음 세션은 여기서 시작
1. ~~관계 데이터 생성~~ **완료 (2026-08-07)**
2. ~~Step 7 스모크 테스트~~ **완료 (2026-08-07, S1~S4 전부 통과)**
3. ~~프론트 A 코드 수정·배포~~ **완료 (2026-08-07)**
4. ~~브라우저 검증 (T27 포함)~~ **완료 (2026-08-07)**
5. ~~023 적용~~ **완료 (2026-08-07)** — 아래 「023 적용 완료」 참고
6. **남은 것**: T31~T33(트리거) / T26 실제 승인·T34(보류, 사용자 판단 필요) /
   `user@naver.com`의 `preferred_language` ko 원복 확인
7. 그다음: 024~027 시드 적재 → 028 → 영업지역 지정 → 029 → 프론트 B → 030
   (순서는 아래 「지역 라우팅 검증 시나리오」와 029 헤더의 HARD PREREQUISITE 참고)

---

# 프론트 A — 022 RPC 전환 (2026-08-07 코드 수정 완료 · 배포/검증 대기)

023이 `profiles` SELECT를 본인+admin으로 잠그기 전에, profiles를 embedded join으로 읽던
2개 경로를 022 RPC로 옮겼다. **PostgREST의 embedded join은 RLS로 걸리면 에러가 아니라
null을 반환**하므로, 전환 없이 023을 적용하면 화면이 조용히 열화된다.

| 파일 | 변경 |
| --- | --- |
| `src/api/properties.api.js` | `listPropertiesForRequest()` → `list_request_responses_for_customer` RPC |
| `src/pages/ResponseStatus/ResponseStatus.jsx` | `p.id`→`p.property_id`, `p.realtor?.nickname`→`p.realtor_display_name` |
| `src/api/chat.api.js` | `ROOM_WITH_PARTICIPANTS` 제거, `getChatParticipants()` 신설, `?? user.id` 폴백 축소 |
| `src/pages/Chat/Chat.jsx` | 참여자 RPC 사용 + **RPC 실패와 참여자 없음을 구분** |
| `src/pages/Chat/translations.js` | `staleConnection` / `participantsFailed` 키 4개 언어 추가 |

Chat.jsx의 두 실패 경로를 섞지 않는다:
- **RPC 호출 실패**(네트워크·권한·배포 문제) → 기존 `error` 화면 + `participantsFailed`
  고정 문구. 원인은 `console.error`로만 남긴다(DB 원문 화면 노출 금지 - Phase 2 원칙).
- **RPC 성공 + 상대 참여자 없음** → `otherProfile=null` → `staleConnection` 안내 +
  입력·전송 비활성.

둘을 같은 null로 뭉개면, 023 정책을 잘못 넣어 RPC가 권한 거부를 내는 상황에서도 화면이
"연결이 오래됐어요"라고 말한다 — 원인을 정반대로 짚게 만드는 안내다. 어느 쪽이든
**조용한 무반응은 남지 않는다.**

동작 변화(의도된 것):
- ResponseStatus 응답 정렬이 `created_at desc` → `nickname, created_at desc`
- 반환 필드가 11개로 축소. 화면이 안 쓰던 `status/request_id/is_public/lat/lng/
  listing_status/address_public`이 빠졌다. 새로 필요해지면 **함수 반환 타입 변경이라
  `create or replace`가 안 되고 v2 함수를 새로 만들어야 한다**(위 10번 항목)
- 그룹핑은 도입하지 않았다. 도입 시 키는 `realtor_display_name`이 아니라 `realtor_id`
  (동명 사무소 혼입 방지). 코드에 주석으로 남겼다

빌드/린트: `vite build` 성공, `oxlint` 신규 경고 0건(기존 경고 7건은 이번에 만진 파일과 무관).

---

# 023 적용 완료 (2026-08-07) — profiles 원본 SELECT 잠금

**적용됨.** 변경 범위는 migration 파일의 실행문 6개 그대로이며, `profiles_update_own`과
다른 테이블 정책은 건드리지 않았다.

## 적용 전 스냅샷 (원복 기준)

- 정책 2행: `profiles_select_authenticated`(qual=`true`) + `profiles_update_own`
- 트리거 1행: `trg_prevent_self_role_change`, `tgenabled='O'`
- `prevent_realtor_nickname_change` **0행**(미적용 확인) /
  `current_user_role`·`handle_new_user`·`prevent_self_role_change` 존재
- `rls_enabled=true`, `rls_forced=false`

## 적용 후 구조 검증 — 통과

- 정책 **3행**: SELECT `profiles_select_admin`(`current_user_role() = 'admin'::user_role`),
  SELECT `profiles_select_own`(`id = auth.uid()`), UPDATE `profiles_update_own`(스냅샷과
  문자열 동일). `profiles_select_authenticated` 제거 확인, 관계 기반 정책 없음 확인
- 트리거 **2행** 둘 다 `tgenabled='O'`: `trg_prevent_realtor_nickname_change`(신규),
  `trg_prevent_self_role_change`(기존)
- 함수 `prevent_realtor_nickname_change`: `security_definer=true`,
  `config={"search_path=pg_catalog, public"}`, `acl_explicit=true`,
  `acl={postgres=X/postgres, service_role=X/postgres}` — **PUBLIC·anon·authenticated 없음**

## T17~T19 — 023의 존재 이유. 실계정 세션으로 실측

`aaa@naver.com`(승인된 중개사) 실제 세션에서:

| | 결과 |
| --- | --- |
| **before** (023 적용 전) `profiles?select=*` | **6행** — 전체 사용자 |
| **after** (023 적용 후) 같은 요청 | **본인 1행만** |
| 고객 UUID 직접 조회 — **채팅 관계 있음** | **`[]`** |
| 고객 UUID 직접 조회 — **요청서 응답 관계 있음** | **`[]`** |

**관계 존재 여부와 무관하게 중개사가 고객 `profiles` 원본 행을 직접 읽을 수 없음을
실측 확인했다.** before/after 대조가 있으므로 이 결과가 정책 변경에서 온 것임이 확정된다.
관계 기반 조회는 022의 두 RPC만 담당한다는 설계가 성립한다.

## T22~T25 정상 기능 회귀 — 통과

ResponseStatus 정상 / Chat 정상 / AdminDashboard 3경로(요청서 고객 nickname · 지원서
profile · 공개 매물 중개사 nickname) 정상 / pending realtor 신청서 정상 유지.

## ⚠ 트리거 함수 EXECUTE revoke — 실측 결과 (일반화 금지)

`prevent_realtor_nickname_change()`의 `authenticated` 직접 EXECUTE가 회수된 상태에서
**실제 `profiles.preferred_language` UPDATE가 정상 성공했다.**

→ **현재 배포 DB와 현재 트리거 구성에서는** 트리거 함수의 직접 EXECUTE 회수가 트리거를
통한 `profiles` UPDATE를 방해하지 않는다. **revoke는 되돌리지 않는다.**

**이것은 이 구성에서의 실측이지 PostgreSQL 전체 동작에 대한 일반화가 아니다.**
버전·트리거 구성·함수 소유자가 달라지면 다시 확인해야 한다. 위 15번 항목("트리거 함수
EXECUTE 회수는 실측이 필요하다")의 미검증 상태는 **이 구성에 한해** 해소된 것으로 기록한다.

## ⏳ 미완료 — `preferred_language` 원복 확인

위 실측 과정에서 **`user@naver.com`(`4b20f04b-...`)의 `preferred_language`가 `ja`로
바뀌었다.** `ko`로 원복한 뒤 아래 쿼리로 확인해야 하며, **확인 전까지 이 항목은 완료가
아니다.**

```sql
select preferred_language from profiles
where id = '4b20f04b-dc7c-4c75-b29e-9f97ce660d84';
-- 기대: ko
```

## 미실시

T26 실제 승인 / T31~T33(아래 SQL 준비됨) / T34(보류 — test3 소진 판단 필요).

## T31~T33 — nickname 트리거 (전부 BEGIN/ROLLBACK, 실데이터 무변경)

### ⚠ 이 테스트가 검증하는 것과 하지 않는 것

`set_config('request.jwt.claims', ...)`는 `auth.uid()`가 읽는 값을 흉내 낼 뿐이고
**SQL Editor의 실제 DB role은 postgres다.** 따라서 아래 3개가 검증하는 것은

- ✅ `prevent_realtor_nickname_change()`의 **`auth.uid()` 분기 판정**
- ✅ 이 트리거가 **다른 UPDATE(언어 변경 등)에 간섭하지 않는지**

이고, **검증하지 않는 것**은

- ❌ authenticated/admin 세션의 **RLS UPDATE 권한**(`profiles_update_own`)

이다. T27에서 "SQL Editor로는 anon EXECUTE를 검증할 수 없다"고 구분한 것과 같은 이유다.
RLS UPDATE 경로는 실제 브라우저 세션(T25 마이페이지 언어 변경, T26 admin 승인)으로 본다.

### T31 — 승인된 중개사 본인이 nickname 변경 시도 → 42501

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', 'b28f1e03-db3f-4faa-be52-eba2f7d50294')::text, true);

-- 기대: ERROR 42501 '승인된 중개사의 사무소명은 관리자만 변경할 수 있습니다.'
update profiles set nickname = 'T31-침해시도'
where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';

rollback;
```
- 예외가 나면 성공이다. 그 시점에 트랜잭션이 abort되므로 `rollback;`만 실행하면 된다.
- **예외 없이 통과하면 트리거가 죽은 것이다.** 023의 ⑥ revoke를 의심하고 재확인한다.
- 확인:
```sql
select nickname from profiles where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';
-- 기대: 베스트공인중개사사무소 (변경 없음)
```

### T32 — admin이 그 중개사의 nickname 변경 → 트리거가 막지 않는다

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '00d6aa35-d64b-43fd-a659-a2f4af23fabc')::text, true);  -- admin 'dada'

update profiles set nickname = 'T32-임시명'
where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';

select nickname from profiles where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';
-- 기대: T32-임시명 (트랜잭션 안에서만)

rollback;
```
확인:
```sql
select nickname from profiles where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';
-- 기대: 베스트공인중개사사무소 (rollback으로 원상복귀)
```
성립 근거: 트리거 조건이 `auth.uid() = old.id`라 **호출자와 대상이 다르면 통과**한다
(`023:93-105`). admin role을 해석하는 게 아니라 관계를 본다.

### T33 — 중개사의 preferred_language 변경 → nickname 트리거가 간섭하지 않는다

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', 'b28f1e03-db3f-4faa-be52-eba2f7d50294')::text, true);

update profiles set preferred_language = 'ja'
where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';

select preferred_language from profiles where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';
-- 기대: ja (트랜잭션 안에서만)

rollback;
```
확인:
```sql
select preferred_language from profiles where id = 'b28f1e03-db3f-4faa-be52-eba2f7d50294';
-- 기대: ko (rollback으로 원상복귀)
```
`nickname`이 그대로이므로 트리거의 첫 조건(`new.nickname is distinct from old.nickname`)이
false가 되어 통과해야 한다. **여기서 42501이 나면 트리거가 과잉 차단하는 것이다** —
언어 변경 기능 전체가 죽으므로 즉시 보고 대상.

**세 테스트 모두 독립된 `begin`/`rollback`이고, `set_config(..., true)`는 트랜잭션
로컬이다. 실패해도 실데이터가 남지 않는다.** T32는 운영 표시명을, T33은 실제 언어 설정을
건드리므로 **반드시 rollback까지 한 묶음으로 실행한다**(중간에 창을 닫지 말 것).

---

## 🚫 HARD PREREQUISITE — 프론트 B(`resolve_chat_customer_id()` 전환)는 030의 선행 조건이다

**단순 이월 항목이 아니다. 순서를 지키지 않으면 중개사 채팅 진입이 막힌다.**

```
029 적용  →  프론트 B 배포(resolve_chat_customer_id 전환)  →  030 적용
```

**프론트 B 없이 030을 먼저 적용하지 않는다.** 030이 중개사의 requests 전체 SELECT를
없애는 순간(`030:98-100`), 프론트 A가 넣은 명시적 에러에 중개사의 신규 채팅 진입
(RealtorRespond 완료 화면 → "고객과 채팅하기")이 걸린다.
같은 내용을 `migration_029_realtor_request_rpc.sql` 헤더에도 적어뒀다.

`getOrCreatePropertyChatRoom()`의 고객 판정을 서버로 옮기는 작업. **이번에 하지 않았다.**

- 기존 코드는 `property.requests?.customer_id ?? user.id` 한 줄이라 "공개 매물이라 요청서가
  없다"와 "요청서는 있는데 조인이 비었다"가 같은 폴백으로 흘렀다.
- **migration_030이 중개사의 requests 전체 SELECT를 없앤다**(`030:98-100`). 그러면 중개사
  세션에서 조인이 null이 되고, 옛 코드는 **customer_id=중개사 본인인 채팅방을 조용히 만든다.**
- 이번 프론트 A는 `request_id is null`로 두 경우를 갈라, 요청서가 있는데 고객을 못 찾으면
  **명시적 에러**를 반환하게 했다. 오늘 기준 동작 변화는 없다(중개사가 아직 requests를 읽을
  수 있음). 조용한 오작동을 눈에 보이는 실패로 바꾼 것까지가 이번 범위다.
- **최종 해법은 `resolve_chat_customer_id(p_property_id)`**(`migration_029:347`)다. 029가
  미적용이라 지금은 호출할 수 없다. 029 적용 시 이 함수로 전환한다.
- 주의: 029/030 적용 후에는 **중개사가 응답 매물 채팅방을 새로 여는 경로**(RealtorRespond
  완료 화면의 "고객과 채팅하기")가 위 명시적 에러에 걸린다. 전환을 029 적용과 **같은 배포에
  묶어야** 한다. 순서가 어긋나면 중개사 쪽 채팅 진입이 막힌다.

---

# 검증용 계정·데이터 (2026-08-07 확정 · 관계 데이터 생성 완료)

## ⛔ 이 섹션에서 가장 먼저 읽을 것 — 계정 삭제 절차는 없다

**여기 나오는 계정 4개는 전부 원래 있던 계정이다. 테스트가 끝나도 삭제하지 않는다.**

이전 버전 문서에는 "테스트 종료 후 Authentication에서 계정 삭제"가 적혀 있었다.
그건 새로 만들 `+test1~3` 계정을 전제로 쓴 절차였고, **지금 계정에 그대로 적용하면
`user@naver.com`의 요청서 7건이 cascade로 함께 사라진다.** 그래서 삭제 절차를 제거했다.
어떤 이유로도 이 계정들을 지우거나 role을 임의로 바꾸지 않는다.

**데이터 삭제 원칙**: `requests` / `properties` / `chat_rooms` / `chat_messages` /
`realtor_applications` 행은 **사용자 승인 없이 삭제하지 않는다.** 정리가 필요해 보이면
대상 행을 먼저 제시하고 승인을 받는다. 이 원칙은 "이번 검증에서 새로 만든 행"에도 적용된다.

## 계정 매핑 (신규 생성 없음)

| 문서상 역할 | 실제 계정 | nickname / 표시명 | role | 비고 |
| --- | --- | --- | --- | --- |
| 고객(구 test1) | `user@naver.com` | user | customer | 요청서 7건 (원래 데이터) |
| 승인된 중개사(구 test2) | `aaa@naver.com` | 베스트공인중개사사무소 | realtor | 공개 매물 1건(`request_id is null`, 원래 데이터) |
| 심사 대기(구 test3) | `test3@naver.com` | 태양공인중개사 | customer | 지원서 1건. **T34 전용** |
| admin | `testreal@naver.com` | dada | admin | — |

미사용: `ts930728@naver.com`(customer, 요청서 1건), `test2@naver.com`(realtor, 대박공인중개사).

**비밀번호**: 모르면 Dashboard > Authentication > Users > 해당 계정 > Reset password로 재설정한다.
재설정한 값은 **대화·로그·저장소 어디에도 적지 않는다**(이 저장소는 public).

## ⚠ test3@naver.com은 1회용이다 — T34 실행 전 반드시 확인받을 것

`test3@naver.com`을 T34(customer→realtor 승인 트랜잭션)에서 승인하면 **되돌릴 수 없다.**
`prevent_self_role_change`(migration_016) 때문에 realtor에서 customer로 복원할 수 없고,
**현재 심사 대기 상태인 계정은 이것 하나뿐**이다. 승인하는 순간 소진된다.

**T34를 실행하기 직전에 이 사실을 사용자에게 다시 알리고 판단을 받는다.**
선택지는 (a) 새 심사 대기 계정을 만들어 T34에 쓰고 test3은 보존 (b) test3을 그대로 소진.
자동으로 (b)를 고르지 않는다. 이 확인 없이 T34를 실행하지 않는다.

[S4]에서 test3을 "무관한 제3자"로 쓰는 것은 **읽기 전용이라 소진되지 않는다.** 무방하다.

## 관계 데이터 — 생성 완료 (023 적용 전 기준선)

2026-08-07 확인. 이전까지는 요청서에 응답한 매물(`properties.request_id is not null`)이
0건이라 채팅방도 없었다(`aaa@naver.com`의 매물 1건은 `request_id is null`인 지도용 공개 매물).

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 요청서 `request_id` | `cc193972-160e-47d1-a51c-23e628cc4ad4` (지역 `신촌`) | **원래 있던 요청서 7건 중 하나** |
| 응답 매물 `property_id` | `c8ab5299-c236-4c21-b165-50107d283a06` (`title='dz'`, realtor=`aaa@naver.com`) | **이번 검증에서 신규 생성** |
| 채팅방 `chat_room_id` | `a325fc9a-a97d-4588-8e66-abbdd2d3d3a1` | **이번 검증에서 신규 생성** |
| 메시지 | 양쪽 1건씩 | **이번 검증에서 신규 생성** |

사용자 UUID (Step 7 식별 쿼리 실측값):
`user@naver.com` = `4b20f04b-dc7c-4c75-b29e-9f97ce660d84` /
`aaa@naver.com` = `b28f1e03-db3f-4faa-be52-eba2f7d50294` /
`test3@naver.com` = `0cc53965-95ea-4ddb-9b54-7fd92fed0dcd`

(위 UUID는 테스트 데이터 식별자다. 자격증명이 아니고 RLS 없이는 쓸 수 없어 기록한다.
대화가 끊겨도 이 문서만으로 Step 7을 돌릴 수 있어야 하므로 확정값으로 남긴다.)

### ⚠ `/chat/:id`의 `:id`는 `chat_room_id`가 아니라 `property_id`다

**한 번 헷갈렸던 지점이라 명시한다.** 2026-08-07에 `c8ab5299-...`(property_id)를
chat_room_id로 잘못 전달한 적이 있고, 원인은 브라우저 주소창이었다.

- 라우트: `App.jsx:58` `<Route path="/chat/:propertyId" element={<Chat />} />`
- `Chat.jsx:20`이 `const { propertyId } = useParams()`로 받고,
  `getOrCreatePropertyChatRoom(propertyId)`(`chat.api.js:10`)가 **그 매물의 채팅방을
  찾거나 만들어서** `room.id`를 준다. 즉 `chat_room_id`는 URL에 등장하지 않는다.
- 매물 1개 + 고객 1명당 채팅방 1개라 둘은 1:1처럼 보이지만 **다른 테이블의 다른 키**다.
- `get_chat_participants(p_room_id)`는 **`chat_room_id`를 받는다.** 여기에 property_id를
  넣으면 에러가 아니라 **0행**이 나온다 — 차단 테스트(S4)의 통과와 구분되지 않으므로
  특히 위험하다. RPC를 손으로 호출할 때는 반드시 `chat_rooms.id`를 확인하고 넣는다.

```sql
-- property_id로 chat_room_id 찾기
select id as chat_room_id, property_id, customer_id, realtor_id
from chat_rooms where property_id = 'c8ab5299-c236-4c21-b165-50107d283a06';
```

확인된 기준선:
- `user@naver.com`의 ResponseStatus에 부동산 이름이 **`베스트공인중개사사무소`** 로 표시됨
  (지금은 embedded join `realtor:profiles(nickname)` 경로, `properties.api.js:178`).
  **023이 `profiles`를 own+admin으로 잠그면 이 경로가 null이 된다** — 프론트 A에서 022 RPC로
  갈아탄 뒤에도 같은 이름이 보여야 통과.
- 채팅방 생성 + 양방향 메시지 송수신 정상 (T23 기준선)

### ★ 임시 변경: `response_deadline` 7일 연장 — 원복은 승인 후에만

테스트를 위해 요청서 `cc193972-...`의 `response_deadline`을 **7일 뒤로 연장했다.**
DB 기본값은 `now() + interval '24 hours'`(`schema.sql:79`)이므로 **이 행만 기본값과 다르다.**

- 이 값은 **테스트용 임시 변경**이다. 실제 운영 정책 변경이 아니다.
- **원래 값으로 임의 복구하지 않는다.** 정리 단계에서 사용자에게 확인받고 처리한다.
- 원래 값(생성 시점 +24h)은 이미 지난 시각이라, 되돌리면 요청서가 즉시 마감 상태로 보인다.
  되돌릴지 / 그대로 둘지 / `status`까지 어떻게 할지는 사용자가 정한다.
- 이 연장 때문에 아래 「발견 사항 ②」(24시간 고정 문구)가 드러났다.

### 관계 데이터 존재 확인 쿼리 (언제든 재확인용)

```sql
select cu.email as customer, ru.email as realtor, r.region_text, r.status,
       pr.title, pr.id as property_id,
       (select count(*) from chat_rooms cr where cr.property_id = pr.id) as rooms
from properties pr
join requests r    on r.id  = pr.request_id
join auth.users cu on cu.id = r.customer_id
join auth.users ru on ru.id = pr.realtor_id;
-- 기대: 1행. customer=user@naver.com, realtor=aaa@naver.com, title='dz',
--       region_text='신촌', rooms=1
```

### 계정 상태 확인 쿼리 (Step 7 전 사전 점검)

```sql
select u.email, p.nickname, p.role, p.preferred_language,
       (select count(*) from requests r  where r.customer_id = p.id) as requests,
       (select count(*) from properties pr where pr.realtor_id = p.id) as properties,
       (select count(*) from realtor_applications ra where ra.profile_id = p.id) as applications
from profiles p join auth.users u on u.id = p.id
where u.email in ('user@naver.com','aaa@naver.com','test3@naver.com','testreal@naver.com')
order by u.email;
-- 기대: aaa=realtor, user=customer, test3=customer(applications=1), testreal=admin
-- test3의 role이 realtor면 T34 대상이 이미 소진된 것이다. 진행을 멈추고 사용자에게 알린다
```

### 관계 데이터를 다시 만들어야 할 때 (재현 절차)

지금은 필요 없다. 데이터가 유실된 경우에만 쓴다.

1. `user@naver.com`의 요청서 중 `status='open'` + 응답 0건인 것을 고른다
   (없으면 앱에서 요청서를 새로 하나 쓴다 — 계정 생성이 아니다. `createRequest()`에
   "이미 열린 요청서가 있으면 막는" 게이트는 없다, `requests.api.js:10`)
2. `aaa@naver.com` 로그인 → 주소창에 `/realtor/respond/<requestId>` 직접 입력
   (목록에서 고르지 않는다 — `listOpenRequests()`가 지역 필터 없이 모든 open 요청서를
   보여준다, `requests.api.js:61`. 영업지역 라우팅 028~030은 미적용)
3. 필수 입력 5개(제목/방타입/보증금/월세/주소)만 채우고 제출 (`RealtorRespond.jsx:57`).
   같은 요청서에 같은 중개사가 두 번 응답하는 것은
   `properties_request_realtor_unique`(migration_007)가 막는다
4. `user@naver.com` 로그인 → `/requests/<requestId>` → "채팅하기" → 메시지 1건
   (채팅방은 이때 생성된다, `chat.api.js:26-44`)
5. `aaa@naver.com`으로 답장 1건

---

# Step 7. 022 RPC 스모크 테스트 (프론트 배포 전)

## ⚠ 이 테스트가 검증하는 것과 하지 않는 것

| 대상 | 검증 수단 | 상태 |
| --- | --- | --- |
| **함수 본문 필터** (auth.uid() 기반 행 제한) | 아래 SQL Editor 스모크 테스트 | 이 단계에서 확인 |
| **ACL 상태** (PUBLIC/anon EXECUTE 부재) | `pg_proc.proacl` 조회 | **완료** (022 적용 시 확인) |
| **실제 anon/authenticated 동작** | **Supabase 클라이언트 세션** | **별도 확인 필요** |

**SQL Editor는 postgres 권한으로 실행된다.** `request.jwt.claims`를 설정하는 것은 `auth.uid()`가
읽는 값을 흉내 내는 것일 뿐, 호출자의 실제 role은 여전히 postgres다.
따라서 **anon/authenticated의 EXECUTE 권한이 실제로 작동하는지는 이 방법으로 확인할 수 없다.**

→ **T27(anon 호출 시 권한 거부)은 SQL Editor로 확인 불가.**
   프론트 A 배포 후 브라우저(비로그인 상태)에서 확인하는 항목으로 옮긴다.

**보고할 때 이 셋을 섞지 않는다.** S1~S4가 전부 통과해도 그것은 **함수 내부
authorization 조건(auth.uid() 기반 행 제한)이 맞다**는 뜻일 뿐이다.
"anon/authenticated가 이 함수를 호출할 수 있는가/없는가"는 **아직 검증되지 않은 상태**로
남는다. 결과를 적을 때 세 줄로 나눠 쓴다:
1. 함수 내부 authorization → S1~S4 (SQL Editor)
2. 함수 ACL(PUBLIC/anon EXECUTE 부재) → **완료** (`pg_proc.proacl`, 022 적용 시 확인)
3. 실제 anon/authenticated 호출 권한 → **미검증**, 프론트 A 배포 후 브라우저에서 확인

## 대상 행 식별 (S1~S4 실행 전 1회)

request/chat_room UUID는 확정값을 그대로 쓴다. **사용자 UUID와 property UUID만 조회한다.**

```sql
select
  (select u.id from auth.users u where u.email = 'user@naver.com')     as customer_id,
  (select u.id from auth.users u where u.email = 'aaa@naver.com')      as realtor_id,
  (select u.id from auth.users u where u.email = 'test3@naver.com')    as unrelated_id,
  'cc193972-160e-47d1-a51c-23e628cc4ad4'::uuid                         as request_id,
  'a325fc9a-a97d-4588-8e66-abbdd2d3d3a1'::uuid                         as chat_room_id,
  (select pr.id from properties pr
    where pr.request_id = 'cc193972-160e-47d1-a51c-23e628cc4ad4'
      and pr.title = 'dz'
      and pr.realtor_id = (select u.id from auth.users u where u.email = 'aaa@naver.com')
  ) as property_id;
-- 6개 값이 전부 non-null이어야 한다. 하나라도 null이면 S1~S4를 돌리지 말고 원인부터 본다
-- 2026-08-07 실측: customer=4b20f04b / realtor=b28f1e03 / unrelated=0cc53965
--                  property_id=c8ab5299-c236-4c21-b165-50107d283a06
-- ★ property_id(c8ab5299)와 chat_room_id(a325fc9a)를 바꿔 넣지 말 것. 위 경고 박스 참고
```

정합성도 함께 본다(요청서 주인 / 채팅방 참여자가 예상과 같은지):

```sql
select r.id as request_id, r.customer_id, r.status, r.region_text, r.response_deadline,
       cr.id as chat_room_id, cr.customer_id as room_customer, cr.realtor_id as room_realtor,
       (select count(*) from properties pr where pr.request_id = r.id) as responses,
       (select count(*) from chat_messages m where m.chat_room_id = cr.id) as messages
from requests r
join chat_rooms cr on cr.id = 'a325fc9a-a97d-4588-8e66-abbdd2d3d3a1'
where r.id = 'cc193972-160e-47d1-a51c-23e628cc4ad4';
-- 기대: status='open', region_text='신촌', response_deadline은 7일 뒤(임시 연장분),
--       room_customer=user UUID, room_realtor=aaa UUID, messages>=2
-- responses는 1이 아닐 수도 있다(다른 중개사 응답이 섞였을 경우). S1은 그래도 유효하다 - 아래 참고
```

## [S1] 정상 — 고객이 자기 요청서의 응답 조회

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select u.id::text from auth.users u
                            where u.email = 'user@naver.com'))::text, true);
select * from public.list_request_responses_for_customer(
  'cc193972-160e-47d1-a51c-23e628cc4ad4');
rollback;
```

기대:
- **`title='dz'` 행이 결과에 포함된다.** ★ "정확히 1행"으로 판정하지 않는다 — 이 요청서에
  다른 중개사 응답이 이미 있거나 나중에 붙을 수 있다. **`dz` 행의 존재와 그 내용**으로 본다
- 그 행의 `realtor_display_name` = `베스트공인중개사사무소`
- 그 행의 `realtor_id` = 위 식별 쿼리의 `realtor_id`(aaa 계정 UUID)와 일치
- 반환 컬럼은 정의된 **11개뿐이고 `phone` 컬럼 자체가 없다**
  (`row.phone is null`이 아니라 **컬럼 부재**로 확인. SQL Editor 결과 헤더에 없어야 한다)
- `customer_id` / `created_by`도 반환되지 않는다

## [S2] 차단 — 중개사가 고객의 응답 목록 조회 시도

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select u.id::text from auth.users u
                            where u.email = 'aaa@naver.com'))::text, true);
select * from public.list_request_responses_for_customer(
  'cc193972-160e-47d1-a51c-23e628cc4ad4');
rollback;
-- 기대: 0행  (T28)
-- 이 함수는 "요청서 주인"에게만 열린다. 자기가 응답한 요청서라도 남의 응답 목록은 못 본다
```

## [S3] 정상 — 고객이 자신이 참여한 채팅방 참여자 조회

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select u.id::text from auth.users u
                            where u.email = 'user@naver.com'))::text, true);
select * from public.get_chat_participants(
  'a325fc9a-a97d-4588-8e66-abbdd2d3d3a1');   -- chat_room_id (property_id 아님)
rollback;
```

기대:
- **정확히 2행** (`user`, `베스트공인중개사사무소`)
- 반환 컬럼 3개뿐: `participant_id` / `nickname` / `preferred_language`
- **`phone` 컬럼 자체가 없다** (값이 null인 게 아니라 컬럼 부재)

## [S4] 차단 — 무관한 사용자가 채팅 참여자 조회 시도

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select u.id::text from auth.users u
                            where u.email = 'test3@naver.com'))::text, true);
select * from public.get_chat_participants(
  'a325fc9a-a97d-4588-8e66-abbdd2d3d3a1');   -- chat_room_id (property_id 아님)
rollback;
-- 기대: 0행  (T21)
-- test3은 읽기만 한다. 이 테스트로는 소진되지 않는다(T34 대상 유지)
```

네 테스트 모두 `begin` → `set_config(..., true)` → 호출 → `rollback` 구조라
JWT claim이 트랜잭션 밖에 남지 않고 데이터도 바뀌지 않는다.

## 실행 결과 — 2026-08-07 전부 통과

| 테스트 | 결과 | 확인된 것 |
| --- | --- | --- |
| S1 | 통과 | `title='dz'` 행 반환, `realtor_display_name='베스트공인중개사사무소'`, `realtor_id=b28f1e03` 일치. 컬럼 11개(`property_id, realtor_id, realtor_display_name, title, address, description, deposit, monthly_rent, room_type, created_at, property_images`). `phone`/`customer_id`/`created_by` **컬럼 자체 부재**. `property_images`는 `[]`(사진 없는 매물이라 `coalesce` 폴백이 의도대로 동작) |
| S2 | 통과 | 0행. 중개사는 자기가 응답한 요청서라도 남의 응답 목록을 볼 수 없다 (T28) |
| S3 | 통과 | 정확히 2행(`b28f1e03`=`베스트공인중개사사무소`/ko, `4b20f04b`=`user`/ko). 컬럼 3개. `phone` 부재 |
| S4 | 통과 | 0행. 무관한 사용자 차단 (T21). test3은 읽기만 했으므로 **소진되지 않음** |

부수 확인: `chat_rooms`의 `customer_id=user`, `realtor_id=aaa`로 정상 저장돼 있다 —
`chat.api.js:23`의 `?? user.id` 폴백은 이 데이터에서 발현되지 않았다
(발현 조건과 030 이후의 위험은 아래 「프론트 A」 항목 참고).

표시명 정합성 확인(2026-08-07): `profiles.nickname` 원본 `length=11`,
S1의 `realtor_display_name`과 S3의 `nickname` 모두 `length=11`로 동일.
한때 S3 결과가 `베스트공인중개사`(8자)로 보였던 것은 **SQL Editor 컬럼 폭에 의한 표시
잘림**이었다. 두 RPC 모두 `profiles.nickname`을 가공 없이 그대로 반환한다
(`migration_022:138`, `:190`). 데이터는 수정하지 않았다.

**이 결과로 확정된 것은 함수 내부 authorization뿐이다.**
1. 함수 내부 authorization → **완료** (S1~S4)
2. 함수 ACL(PUBLIC/anon EXECUTE 부재) → **완료** (`pg_proc.proacl`, 022 적용 시)
3. 실제 anon/authenticated 호출 권한(T27) → **미검증.** 프론트 A 배포 후 브라우저에서 확인

`set_config(..., true)`는 트랜잭션 로컬이고 전부 `rollback`으로 닫으므로 데이터가 바뀌지 않는다.

---

# T23 검증 기준 (번역 동작만으로 통과시키지 않는다)

번역이 되더라도 다른 fallback이 개입했을 수 있다. **먼저 데이터를 확인하고, 그다음 UI를 본다.**

**1단계 — `get_chat_participants` 반환값 확인** (S3 또는 브라우저 콘솔)
- [ ] 정확히 **2행** 반환
- [ ] `user@naver.com`(nickname `user`)의 `preferred_language` = 실제 설정값
- [ ] `aaa@naver.com`(nickname `베스트공인중개사사무소`)의 `preferred_language` = 실제 설정값
      (기존 계정이라 `ko`가 아닐 수 있다. **「계정 상태 확인 쿼리」로 미리 확인한 값과
      같은지**를 본다)
- [ ] **`Object.keys(row)`에 `phone` 키 자체가 없음** — `row.phone === null`로 판단하지 말 것

**2단계 — Chat UI 별도 검증**
- [ ] 헤더에 상대 닉네임이 표시된다 (기본 제목이 아니라)
- [ ] 메시지 전송이 동작한다
- [ ] 번역이 동작한다 (양쪽 언어가 다를 때)

1단계가 통과하지 않으면 2단계 결과는 의미가 없다.

---

# 발견 사항 (2026-08-07, 관계 데이터 생성 중 발견 — 조사·기록만, 수정 안 함)

두 건 다 023 작업과 무관하다. **지금 고치지 않는다.** 022~032가 끝난 뒤 별도 항목으로 다룬다.

## ① 응답 매물 "상세 보기"가 준비 중 화면으로 간다

- **현재 상태**: 버그가 아니라 **의도적 placeholder**다. 링크가 `/coming-soon`으로
  **하드코딩**되어 있다. 다만 "응답 매물 상세 화면이 아예 없다"는 기능 공백은 실재한다.

- **재현 경로**: `user@naver.com` 로그인 → `/requests/cc193972-...` → 응답 카드의
  **"상세 보기"** → `/coming-soon`(준비 중 화면). 4개 언어 모두 동일
  (`detailBtn`: 상세 보기 / 詳細を見る / 查看详情 / Details).

- **영향**: 고객이 응답받은 매물의 **사진·상세설명·주소·거래조건을 볼 수 있는 화면이 없다.**
  ResponseStatus 카드에 나오는 요약(대표 사진 1장, 주소, 보증금/월세, description)이
  전부이고, 그 이상을 보려면 **채팅으로 물어보는 수밖에 없다.**
  중개사가 사진을 여러 장 올려도 고객은 첫 장만 본다
  (`ResponseStatus.jsx:140-148`이 `sort_order` 최솟값 1장만 렌더).

- **관련 파일·route**
  - `src/pages/ResponseStatus/ResponseStatus.jsx:165` — `<Link to="/coming-soon">{t.detailBtn}</Link>`
  - `src/pages/ResponseStatus/translations.js` — `detailBtn` (ko/ja/zh/en)
  - `src/App.jsx:78` — `/coming-soon` → `ComingSoon`
  - `src/App.jsx:43` — `/property/:propertyId` → `PropertyDetail` (**존재하지만 연결 안 됨**)

- **왜 연결되지 않았는가 (핵심)**: `PropertyDetail`은 **지도 공개 매물 전용**이다.
  URL 직접 진입 시 `listPublicProperties()` = `get_public_listings()` RPC로 조회하는데
  (`PropertyDetail.jsx:43-54`, `properties.api.js:66`), 이 함수는
  `is_public = true and listing_status = 'active' and lat/lng is not null`인 행만 반환한다
  (`migration_011_address_privacy.sql:51-54`).
  **응답 매물은 `is_public=false`에 좌표도 없으므로 여기서 절대 나오지 않는다.**
  즉 링크만 `/property/:id`로 바꾸면 화면은 뜨지만 **"매물을 찾을 수 없어요"**
  (`PropertyDetail.jsx:49`)가 뜬다. 링크 한 줄 교체로 끝나는 일이 아니다.
  RLS 자체는 이미 열려 있다 — `properties_select_related`(`policies.sql:54-63`)가
  요청서 주인에게 SELECT를 허용하고 `property_images`도 같은 조건으로 열려 있다
  (`policies.sql:87-102`). 막고 있는 것은 **조회 경로(공개 전용 RPC)이지 권한이 아니다.**

- **후속 해결 후보**
  - (a) `PropertyDetail`에 "응답 매물" 모드 추가 — 공개 매물이면 `get_public_listings()`,
    아니면 `getPropertyById()`(`properties.api.js:35`, RLS가 이미 보호)로 분기.
    좌표·지도·즐겨찾기 표시는 공개 매물 전용이라 함께 분기해야 한다.
    채팅 진입은 분기할 필요가 없다 — **채팅방 생성 함수는 `getOrCreatePropertyChatRoom()`
    하나뿐이고**(`chat.api.js:10`) `PropertyDetail.handleContact`와 `/chat/:propertyId`가
    같은 함수를 쓴다. 방이 두 개 생길 위험은 없다
  - (b) 응답 매물 전용 상세 화면을 새로 만든다 (`/requests/:requestId/response/:propertyId` 등).
    공개 매물용 개인정보 마스킹 로직을 안 물고 가는 게 장점
  - (c) ResponseStatus 카드를 확장(사진 캐러셀 + 전체 설명 펼치기)해 별도 화면 자체를 없앤다.
    가장 싸지만 매물 정보가 늘어나면 다시 좁아진다
  - 어느 쪽이든 **`023` 적용 후에 착수한다.** 023이 `profiles` 접근 경로를 바꾸므로
    중개사 이름 표시 방식이 먼저 확정돼야 한다

## ② "24시간 안에 응답" 안내 문구가 실제 `response_deadline`과 분리돼 있다

- **현재 상태**: 카운트다운은 **실제 값**으로 계산되고, 안내 문구만 **"24시간" 하드코딩**이다.
  두 값이 같은 출처를 쓰지 않는다. DB 기본값이 24시간이라 **평소에는 우연히 일치**하고,
  이번처럼 deadline이 달라지는 순간 어긋난다.

- **재현 경로**: 요청서 `cc193972-...`의 `response_deadline`을 7일 뒤로 연장
  (이번 테스트에서 실제로 함) → `/requests/cc193972-...` →
  카운트다운은 `167시간 55분`을 정확히 표시하는데 바로 아래 문구는
  **"24시간 안에 부동산에서 응답이 도착해요"** 로 고정.

- **영향**: 지금은 **운영 사용자에게 드러나지 않는다** — `response_deadline` 기본값이
  `now() + interval '24 hours'`(`schema.sql:79`)라 모든 실제 요청서가 24시간이기 때문이다.
  **응답 기간 정책을 바꾸는 순간(운영 중 조정, 지역별 차등, 프로모션 등) 전 화면이
  거짓말을 하게 된다.** 지금 고쳐야 할 결함이라기보다 **구조적 결합 누락**으로 기록한다.
  같은 "24시간" 주장이 여러 화면에 흩어져 있어, 정책을 바꿀 때 한 곳만 고치면 불일치가 남는다.

- **관련 파일·route** (전부 4개 언어 하드코딩)
  | 위치 | 키 | 문구 |
  | --- | --- | --- |
  | `ResponseStatus/translations.js:6,21,36,51` | `timerSub` | 24시간 안에 부동산에서 응답이 도착해요 / 24時間以内に不動産から返答が届きます / 24小时内将收到中介的回复 / Agents will respond within 24 hours |
  | `RequestSuccess/translations.js:4,10,16,22` | `desc` | 24시간 이내 여러 공인중개사가 제안을 보내드립니다 (+ja/zh/en) |
  | `Landing/translations.js:9,43,77,111` | `trustLine` | 여러 공인중개사가 24시간 안에 답해요 (+ja/zh/en) |
  | `LandingV3/translations.js:10` | `trustLine` | 여러 공인중개사가 24시간 안에 답해요 (ko만) |

  - 카운트다운 계산: `ResponseStatus.jsx:24-32` `splitRemaining()` —
    `request.response_deadline`과 `Date.now()`의 차이. **DB 값 기반이라 정확하다**
  - 렌더: `ResponseStatus.jsx:113-120` — 숫자는 `remaining`, 문구는 `t.timerSub`(정적 문자열)
  - 마감 후 문구 `timerExpired`는 정상 동작 (`remaining.expired` 분기, `:109-110`)
  - 값의 단일 출처: `schema.sql:79`의 컬럼 DEFAULT. **애플리케이션 코드에는 이 24시간을
    나타내는 상수가 없다** — 프론트는 이 숫자를 알 방법이 지금 없다

- **후속 해결 후보** (우선 검토 방향: **`response_deadline`을 기준으로 문구를 동적 생성**)
  - (a) `timerSub`를 함수형 번역으로 바꾼다 — `CustomerHome/translations.js`의
    `rentLine`/`depositLine` 함수형 포맷터 패턴이 이미 이 저장소에 있음.
    `created_at` → `response_deadline` 차이에서 시간을 계산해 "N시간 안에…"로 생성.
    ResponseStatus는 두 값을 이미 갖고 있어 추가 조회가 없다
  - (b) 응답 기간을 설정값으로 승격 — 환경변수 또는 DB 설정 테이블에 두고 컬럼 DEFAULT와
    프론트 문구가 같은 값을 참조. Landing/RequestSuccess처럼 **요청서가 아직 없는 화면**은
    (a)로 해결이 안 되므로 이쪽이 필요하다
  - (c) 요청서 없는 화면의 문구에서 숫자를 빼는 안("빠르게 답해요")도 후보.
    다만 24시간은 마케팅 메시지의 핵심이라 제품 판단이 필요하다
  - **선행 결정**: 응답 기간을 앞으로도 24시간 고정으로 갈 것인지. 고정이면 (a)만으로 충분하고,
    가변으로 갈 거면 (b)가 선행되어야 한다. 이건 제품 결정이라 사용자가 정한다

## ③ MyPage 다국어 누락 (2026-08-07, 023 검증 중 발견)

- **현재 상태**: 기존 누락. **023과 무관하다**(정책 변경이 문구에 영향을 줄 수 없다).
  023 검증 과정에서 언어를 ja로 바꿨다가 눈에 띄었다.
- **재현 경로**: 로그인 → 언어를 일본어로 전환 → `/mypage`
- **증상**: "마이페이지", "고객 계정", "응답 대기 중", "확인하기" 등이 한국어로 남는다.
- **영향**: 초기 타깃이 외국인 사용자인데 로그인 후 첫 화면 중 하나가 절반만 번역된 상태다.
  기능 장애는 아니지만 신뢰도에 직접 영향.
- **관련 파일**: `src/pages/MyPage/`에는 `MyPage.jsx` / `MyPage.css` 둘뿐이고
  **`translations.js`가 없다** (2026-08-07 확인). 다른 페이지가 쓰는 "페이지별
  `translations.js` + `useLanguage()`" 패턴이 이 화면에만 적용되지 않았다. 즉 문구가
  JSX에 하드코딩돼 있어서 언어 전환이 애초에 닿지 않는다.
- **후속**: `MyPage/translations.js` 신설 + `useLanguage()` 적용. 다른 화면과 같은 패턴이라
  난이도는 낮다. 이 기회에 하드코딩 한글 잔존 여부를 전체 화면으로 훑는 편이 낫다 —
  같은 누락이 다른 페이지에도 있을 수 있다. **지금 고치지 않는다.**

---

# 지역 라우팅 검증 시나리오 (2026-08-07 정리 · 실행은 028 이후)

## 현재 상태 확인 — 라우팅은 아직 전혀 검증되지 않았다

2026-08-07 기준 사실:

- **024~032 전부 미적용.** 적용된 것은 022, 023뿐이다
- `realtor_service_areas` 테이블은 **028**에서 생성된다 → **아직 존재하지 않는다.**
  따라서 **어떤 중개사도 담당 지역을 가진 적이 없다**
- 라우팅 RPC(`list_open_requests_for_realtor` 등)는 **029**, 테이블 직접 조회를 막는
  정책 잠금은 **030**이다
- 지금 중개사 목록은 `listOpenRequests()`(`requests.api.js:61`)가 `.eq('status','open')`만
  걸고 전부 가져오며, RLS(`policies.sql:36`)도 `role='realtor'`면 전체 requests를 허용한다
  → **aaa 대시보드에 신촌·강남이 모두 보이는 것이 현재로선 정상이다.** 버그가 아니다

**024/025/026은 빈 테이블만 만든다.** `insert`/`copy`가 한 줄도 없다(파일 전수 확인).
`scripts/seed-stations/` 디렉터리도 아직 없다. 즉 **시드 적재가 별도 선행 작업**이다.

## 선행 조건 (이 순서를 지킨다)

```
① 024~027 적용 + 시드 적재 (districts / lines / stations / station_lines /
   station_districts / station_aliases)
② 기존 요청서 백필 — station_id를 채워야 district_code가 파생된다
③ 028 적용
④ 사용자가 중개사별 담당 지역 지정 (admin, realtor_service_areas INSERT)
⑤ 029 적용 + 프론트 B 배포
⑥ 030 적용   ← 프론트 B 없이 먼저 적용 금지(위 HARD PREREQUISITE)
```

**②를 빠뜨리면 라우팅이 전부 빈 목록으로 보인다.** 027의 `fill_request_location()`은
`station_id`가 null이면 `district_code`도 null로 둔다(`027:135-140`). 그리고 029의
`list_open_requests_for_realtor()`는 `sa.district_code = r.district_code` 매칭을 요구한다
(`029:168-174`). 즉 **기존 요청서는 전부 어느 중개사에게도 보이지 않게 된다.**
`cc193972-...`(신촌)의 백필 대상은 2호선 신촌역이다(위 14번 항목 — **추정값**이라는 점과
경의중앙선 신촌역과의 구분 문제를 함께 볼 것. 두 역 모두 서대문구라 라우팅 결과는 같다).

**프론트도 함께 바뀌어야 한다** (이 시나리오의 숨은 전제):
- `RealtorDashboard` → `list_open_requests_for_realtor()` 전환
- `RealtorRespond` → `get_open_request_for_realtor()` 전환
  (030 후 `getRequestById()`는 중개사에게 0행이다 — `029` 2번 함수 주석)
- `RequestWizard` 지역 단계 → **역 선택 UI**. 지금은 자유 입력이라 신규 요청서의
  `station_id`가 계속 null이 되고, 백필해도 새 요청서가 또 라우팅 밖으로 샌다

## 검증 시나리오 — 누구에게 어느 구를 주고 무엇이 보여야 하는가

**지금 정해둔다.** 나중에 결과를 보고 기준을 맞추면 검증이 아니다.

### 담당 지역 배정 (④ 단계에서 이대로 넣는다)

| 중개사 | 담당 구 | 코드 | 역할 |
| --- | --- | --- | --- |
| `aaa@naver.com` (베스트공인중개사사무소) | 서대문구 | `11410` | **양성 대조** — 신촌 요청서를 받아야 한다 |
| `test2@naver.com` (대박공인중개사) | 강남구 | `11680` | **음성 대조** — 신촌 요청서를 받으면 안 된다 |

`test2@naver.com`은 지금까지 미사용 계정이었는데, **음성 대조군으로 여기서 쓴다.**
중개사가 하나뿐이면 "안 보여야 할 사람에게 안 보인다"를 확인할 수 없다.
코드값은 시드 적재 후 `select code, name_ko from districts where name_ko in ('서대문구','강남구')`로
**반드시 실물 확인**한다(위 표는 행정표준코드 기준 값이며 시드와 대조 전이다).

### 요청서 배치

| 요청서 | 역/구 | 출처 |
| --- | --- | --- |
| `cc193972-...` (신촌) | 신촌역 → 서대문구 | 기존. ② 백필 대상 |
| 신규 강남 요청서 1건 | 강남역 → 강남구 | ⑤ 이후 `user@naver.com`으로 작성(역 선택 UI 필요) |

### 판정 기준

| # | 세션 | 확인 | 기대 |
| --- | --- | --- | --- |
| R1 | `aaa` | `list_open_requests_for_realtor()` | 신촌 요청서 **포함** |
| R2 | `aaa` | 같은 호출 | 강남 요청서 **미포함** |
| R3 | `test2` | 같은 호출 | 강남 요청서 **포함** |
| R4 | `test2` | 같은 호출 | 신촌 요청서 **미포함** |
| R5 | `test2` | `get_open_request_for_realtor('cc193972-...')` | **0행** (URL 직접 접근 차단) |
| R6 | `test2` | `/realtor/respond/cc193972-...` 직접 진입 후 응답 시도 | **INSERT 거부** (030의 `properties_insert_realtor`가 영업지역을 검사) |
| R7 | 담당 지역 없는 중개사 | `list_open_requests_for_realtor()` | **0행** (전국이 보이지 않는다) |
| R8 | `user` | ResponseStatus / Chat | 023 이후와 동일하게 정상 |

**R2·R4가 이 검증의 핵심이다.** R1·R3만 통과하는 것은 "전부 보이는" 현재 상태와
구분되지 않는다. **안 보여야 할 것이 안 보이는지**를 봐야 라우팅이 실제로 작동하는 것이다.

R5·R6은 목록에서 감추는 것과 실제 접근 차단이 다르다는 점을 확인한다 — 목록만 필터링하고
직접 접근이 열려 있으면 라우팅은 UI 장식일 뿐이다.

### 배정 전 기준선 (④ 직전에 찍어둘 것)

```sql
-- 028 적용 직후, 아직 아무 영업지역도 넣지 않은 상태에서
select count(*) from realtor_service_areas;   -- 기대: 0
-- 이 상태로 R7을 먼저 확인하면 "지역 없으면 0행"이 기본 동작임을 증명할 수 있다
```