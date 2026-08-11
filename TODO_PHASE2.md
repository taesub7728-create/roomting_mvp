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

## 4. migration 031은 중복 응답 발생 후 **무손실 롤백**이 불가능하다

> **2026-08-11 표현 정정.** 이 항목은 원래 "실질적으로 되돌릴 수 없다"로 적혀 있었다.
> **과한 표현이었다.** 되돌릴 수 없는 것은 스키마가 아니라 데이터다.

- **현재 상태**: 설계 확정, 미적용
- **정확한 서술**: 031 적용 후 같은 `(request_id, realtor_id)` 중복 property 가 생기면
  **031 이전 상태로의 lossless rollback 이 불가능하다.**
  **스키마 자체는 되돌아간다** — 중복 그룹에서 하나만 남기고 나머지를 **의도적으로 폐기**한 뒤
  `properties_request_realtor_unique` 를 재생성하면 된다.
  불가능한 것은 스키마 롤백이 아니라 **무손실 롤백**이다.
- **감수하는 위험**: 폐기된 property 에 연결된 `property_images` / `favorites` /
  `chat_rooms` / `chat_messages` 가 **ON DELETE CASCADE 로 함께 손실된다**(대화 기록 포함).
  Supabase Free 플랜에는 자동 백업이 없다(일일 백업은 Pro 이상, PITR 은 유료 애드온).
  **무손실 롤백을 위해 백업이 필요한 이유가 이것이다** — 백업이 지키는 것은 스키마가 아니라
  폐기될 데이터다.
- **재검토 조건**: 적용 전 **5개 테이블** 백업이 반드시 선행되어야 한다.
  백업 없이 적용하지 않는다.

  ```
  properties · property_images · favorites · chat_rooms · chat_messages
  ```

  ★ **`favorites` 는 2026-08-11 에 추가됐다.** 원래 이 항목은 4개로 적고 있었다.
  근거: `favorites.property_id` → `properties.id`, **ON DELETE CASCADE**(schema.sql:141).
  즉 `properties` 삭제 시 찜 데이터가 함께 사라지는 **구조적 폐쇄 집합의 일부**다.
  "지금 몇 행이냐"와 무관하게 대상이며, **2026-08-11 프로덕션 실측에서 `favorites` = 1행**으로
  실제 데이터 존재까지 확인됐다. 4개만 백업하고 롤백했다면 그 1행은 복구 수단 없이 소실됐다.
  incoming FK 전수(4행, 전부 CASCADE)를 `pg_constraint` 로 실측 확인했다.

  ※ `requests` 는 **snapshot-only / not restore target** — 아래 「031 백업 설계」 참고.
- **관련 위치**: `migration_031_multi_property_response.sql` 헤더(13행이 4개로 적고 있다 —
  **정본이므로 수정하지 않는다.** 실제 대상은 5개이며 이 문서가 기준이다)

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

## 17. 광운대역 - 경의중앙선 행의 노선 표시 처리 (station 병합은 확정, 표시는 미확정)

- **현재 상태**: `scripts/seed-stations/manual-overrides.mjs`(RV-24e08948, 2026-08-08)에서
  경원선(1호선 방면)·경춘선·경의중앙선 3개 source row 를 station 1개로 CONFIRMED_MERGE 확정.
  **병합 여부 자체는 이 항목의 대상이 아니다 - 이미 끝났다.**
- **남은 문제**: 경의중앙선 행은 실제로 여객 열차가 서지 않는 선로(광운대역 자체는 경원선/경춘선
  분기점 인근의 같은 역사, 40m)다. `lines`/`station_lines` 시드 단계에서 사용자에게 노출할
  노선 목록에 "경의중앙선"을 넣으면 실제로 탈 수 없는 노선이 검색·필터에 나타나게 된다.
- **재검토 조건**: `config.mjs`의 `lineDisplayOrder`(표시 노선 모델, 아직 미확정 - line-identity.mjs
  204번째 줄대 주석 참고)를 확정하는 시점에 광운대역 케이스를 반드시 포함해서 검토한다.
- **관련 위치**: `scripts/seed-stations/manual-overrides.mjs`(RV-24e08948),
  `scripts/seed-stations/config.mjs`(`lineDisplayOrder`)
- **2026-08-09 갱신**: display line 매핑이 확정됐다(`scripts/seed-stations/lib/display-lines.mjs`).
  **재검토 조건이 채워졌는데도 문제는 아직 그대로 남아 있다.** 광운대역은 station 병합
  결과대로 `I4102@N`(1호선)·`I4108@GJ`(경의중앙선)·`I4108@GC`(경춘선) 3개 identity를
  그대로 갖고, `stationDisplayLines()`는 이 3개를 서로 다른 display line으로 정상 계산해
  "1호선 · 경의중앙선 · 경춘선"을 낸다(family 관계로 뭉개지 않는 것 자체는 옳다 - selftest
  X15/X16 참고). 즉 **"실제로 못 타는 경의중앙선이 노선 목록에 뜨는 문제"는 display line
  계층에서 해결할 성격이 아니라, 애초에 이 3-identity CONFIRMED_MERGE 병합 판정 자체를
  재검토해야 하는 문제다.** `scripts/seed-stations/output/seed_stations.sql`(2026-08-09
  생성, 아직 미실행)에도 이 상태 그대로 들어가 있다.

## 18. station/line seed 재시딩(reconciliation) 전략 미결

- **현재 상태**: `scripts/seed-stations/generate-seed-sql.mjs`가 만드는
  `output/seed_stations.sql`은 **one-shot 전제**다 - migration 024/025 적용 직후
  `lines`/`stations`/`station_lines`가 전부 비어 있다고 가정하고, `gen_random_uuid()`로
  새 id를 발급한다. empty-table guard가 있어 두 번째 실행은 항상 실패한다(의도).
- **남은 문제**: `requests.station_id`(migration 027)가 실제로 `stations.id`를 참조하기
  시작한 뒤에 재시딩이 필요해지면(표준데이터 연 1회 갱신, 병합 판정 재검토 등),
  **이미 발급된 station.id를 그대로 보존해야 한다** - id가 바뀌면 과거 요청서의
  `station_id` 참조가 조용히 끊긴다. 지금 seed 생성기에는 이 경우를 위한 별도 로직이
  없다.
- **재검토 조건**: `requests.station_id` 백필이 실제로 시작되기 전에, "이미 있는 station을
  건드리지 않고 신규/변경분만 반영하는" reconciliation pipeline을 별도로 설계한다.
- **관련 위치**: `scripts/seed-stations/generate-seed-sql.mjs`,
  `supabase/migration_027_requests_location.sql`(`station_id`)

## 19. ★ 경계역의 secondary district가 routing에 사용되지 않는다 (2026-08-09 확인, 높은 우선순위)

- **현재 상태**: 10개 multi-district station의 secondary district는 `station_districts`에
  저장되지만 **routing에 사용되지 않는다.**
- **원인**: `migration_027_requests_location.sql:146`의 트리거가 `and sd.is_primary`로
  primary 하나만 파생해 `requests.district_code`(단일 text)에 넣고,
  `migration_029_realtor_request_rpc.sql:173`/`:235`가
  `sa.district_code = r.district_code` **단일값 등호 비교**로 판정한다.
  `station_districts`를 읽는 코드는 027의 트리거 하나뿐이고 029에는 등장하지 않는다.
- **판단**: `migration_026_station_mapping_search.sql:8-9`에 문서화된 의도이나
  (MVP는 is_primary 하나로만 라우팅), **실제 영향 역이 10개로 확인됐다.**

  실제 영향:
  | 역 | primary | secondary | 결과 |
  | --- | --- | --- | --- |
  | 신논현 | 서초구 | 강남구 | 강남구-only 중개사가 못 봄 ★ 가장 시급 |
  | 동작 | 서초구 | 동작구 | 동작구-only 중개사가 못 봄 |
  | 총신대입구 | 서초구 | 동작구 | 동작구-only 중개사가 못 봄 |
  | 신설동 | 동대문구 | 종로구 | 종로구-only 중개사가 못 봄 |

  나머지 6개: 서울역(중구/용산구) · 디지털미디어시티(마포구/은평구) · 사당(동작구/관악구) ·
  대림(구로구/영등포구) · 보라매(영등포구/동작구) · 석계(성북구/노원구).

  **신논현이 가장 시급하다** — 강남 상권 인식이 강한 역이라 11월 영업에서 바로 체감될
  가능성이 높다.
- **감수하는 위험**: 경계역 요청서가 secondary 구 중개사에게 도달하지 않는다. 요청서가
  사라지는 것은 아니고 primary 구 중개사에게는 정상 전달된다.
- **재검토 조건 / 방향**: 향후 확장 시에는 `station_districts` live join보다
  **"요청 작성 시점 eligible districts snapshot"** 방식을 우선 검토한다.
  이유: `migration_027_requests_location.sql:19-20`의 "작성 시점 지역을 고정하여 과거 요청
  routing이 station mapping 변경으로 흔들리지 않게 한다"는 원칙을 유지하기 위함이다.
  live join으로 바꾸면 이 보장이 사라진다.

  예상 구조(향후 설계 단계에서만 검토, 이번엔 구현 안 함):
  ```
  requests.district_code = 대표 표시용 primary
  request_districts      = 작성 시점 routing eligible snapshot
  ```
- **이번 단계에서 하지 않은 것**: 027 수정 / 029 수정 / live join 전환 /
  `requests`에 array·추가 관계 추가 / 특정 역 예외처리. **`station_districts` 318행은
  secondary 10행을 포함해 그대로 시드한다** — 026:8-9가 상정한 그림 그대로이며,
  나중에 029 술어만 넓히면 재시딩이 필요 없다.
- **관련 위치**: `supabase/migration_026_station_mapping_search.sql`(8-9, 35-47),
  `supabase/migration_027_requests_location.sql`(19-20, 142-158),
  `supabase/migration_029_realtor_request_rpc.sql`(169-174, 231-236)

## 20. sido(시도) master 테이블이 없다 (2026-08-09 기록)

- **현재 상태**: `districts.sido_code`(2자리)는 있지만 **시도 이름을 담는 테이블이 없다.**
  `districts.name_ko`에는 해당 district 자체의 이름만 넣기로 확정했다(예: `중구`,
  `분당구`, `과천시`, `가평군`).
- **드러나는 지점**: 전국 master를 시드하면 동명 구가 다수 생긴다(중구·남구·동구·서구 등).
  `code`가 PK라 DB 무결성 문제는 없고 식별의 source-of-truth는 `code` + `sido_code`이지만,
  중개사 영업지역 선택 UI 등에서 "서울특별시 · 중구" / "부산광역시 · 중구"로 구분해
  보여주려면 시도명을 어디선가 가져와야 한다.
- **제외 이유**: 서울 MVP에서는 시도가 하나(`11`)라 필요하지 않다. 지금 만들면
  쓰이지 않는 테이블이 하나 늘어난다. `name_ko`를 인위적으로 길게 만드는 것
  (`서울특별시 중구`)도 채택하지 않았다 — 표시 문제를 데이터에 섞는 것이기 때문이다.
- **재검토 조건**: 확장축(1)로 경기/인천 이상을 열어 시도가 2개 이상이 되는 시점,
  또는 전국 district 선택 UI를 실제로 만드는 시점. 그때 sido master 테이블을 만들지
  프론트 상수로 둘지 결정한다(시도는 17개 고정이라 후자도 성립한다).
- **★ 그때 반드시 알아야 할 것 (2026-08-09 실데이터 확인)**: 시도 master를 만들 때
  **법정동 전체자료의 시도-level 행(`^\d{2}00000000$`)만 뽑으면 안 된다.**
  **세종특별자치시는 시군구-level 행 `3611000000`은 있으나 시도-level 행 `3600000000`이
  아예 없다.** 시도-level 존재 행은 15개인데 시군구를 가진 시도는 16개다. 시도-level
  행만으로 master를 만들면 세종만 조용히 빠진다.
- **관련 위치**: `supabase/migration_024_districts.sql`(`sido_code`),
  `supabase/migration_028_realtor_service_areas.sql`(영업지역 선택 UI)

## 21. districts 시드에 쓴 법정동코드 파일의 vintage (2026-08-09 기록)

- **파일**: `scripts/seed-stations/data/법정동코드 전체자료.txt`
  (행정안전부 행정표준코드, code.go.kr).
- **★ 두 날짜를 혼동하지 말 것 — 서로 다른 값이다:**

  | | 값 | 뜻 |
  | --- | --- | --- |
  | download date | **2026-08-09** | 파일을 내려받아 `data/`에 넣은 날 (파일 mtime 기준) |
  | `source_version` | **20260701** | 아래 정의. **다운로드 날짜가 아니다** |

- **★ 공식 기준일자를 확인할 수 없었다.** 다운로드 화면에 기준일자·자료기준일·최종갱신일
  표기가 없고, 파일 내부에도 metadata가 없다(컬럼 3개 = `법정동코드`/`법정동명`/`폐지여부`,
  날짜 컬럼 없음, 연도 패턴 0건).
- **`source_version` 정책 재정의**: 실행일도 다운로드일도 쓰지 않는다. 대신
  **"이 snapshot에서 현행 상태로 반영됨을 실데이터로 확인한 가장 최근 공식 법정동 변경
  시행일"**로 정의하고 `'20260701'`을 쓴다.
- **근거 (실데이터 확인 완료)**:
  - 전남광주통합특별시(12) 통합 반영 — 시군구 27개 전부 `존재`, 폐지 0.
    광주광역시(29)·전라남도(46)는 시도-level 포함 전 행이 `폐지`(존재 0건)
  - 인천 개편 반영 — 제물포구(28125)·영종구(28155)·서해구(28275)·검단구(28290) `존재`,
    옛 중구(28110)·동구(28140)·서구(28260)는 `폐지`
  - 화성시 일반구 4개 반영 — 만세구(41591)·효행구(41593)·병점구(41595)·동탄구(41597) `존재`
  - 위 개편들의 공식 시행일이 2026-07-01이므로, 이 파일은 최소한 그 이후의 현행본이다
- **한계**: 파일에 **시행 예정 코드와 현행 코드를 구분할 근거가 없다**(`폐지여부`가
  `존재`/`폐지` 2종뿐, 날짜 컬럼 없음). 즉 이 파일은 **특정 시점의 스냅샷**이며
  "2026-07-01 이후 어느 시점"까지만 말할 수 있다. `'20260701'`은 하한선이다.
- **서울 25개 구에는 영향이 없다** — 개편 대상이 아니고, Kakao 교차검증에서
  missing 0 / mismatch 0을 확인했다.
- **재검토 조건**: **경기·인천 확장 시 이 vintage가 최신인지 반드시 재확인한다.**
  인천은 이번 개편의 직접 대상이라 특히 그렇다. 재다운로드 시 이 항목의 근거 3개를
  다시 대조해 `source_version`을 갱신할지 판단한다.
- **관련 위치**: `scripts/seed-stations/config.mjs`(`sourceFiles.legalDongCode`),
  `supabase/migration_024_districts.sql`(`source_version`)

## 22. seed_districts.sql guard가 "테이블 부재"와 "데이터 있음"을 구분해 알려주지 않는다

- **현재 상태**: guard는 `IF EXISTS (SELECT 1 FROM station_districts LIMIT 1)` 형태라,
  테이블 자체가 없으면 Postgres 기본 오류 `42P01 relation "station_districts" does not
  exist`가 난다. 커스텀 메시지("비어 있지 않습니다")와 문구가 달라 혼동되지는 않지만,
  **어느 migration이 누락됐는지 바로 알 수 없다**(실제로 2026-08-09에 한 번 겪었다).
- **개선안**: guard 맨 앞에 `to_regclass()` 기반 존재 확인을 넣는다. `to_regclass()`는
  없는 객체에 예외 대신 NULL을 돌려줘서 PL/pgSQL 안에서 안전하다.
  ```sql
  IF to_regclass('public.station_districts') IS NULL THEN
    RAISE EXCEPTION 'seed_districts.sql: station_districts 테이블이 없습니다. migration_026 을 먼저 적용하십시오. (순서: 024 → 025 → 026 → seed_stations → seed_districts)';
  END IF;
  ```
  `districts`(024) / `stations`(025)도 같은 방식으로 앞에 둔다.
- **재검토 조건**: 다음에 generator를 손댈 때 함께 반영한다. **이번 적용의 blocker가
  아니다** — 026을 먼저 적용하면 이 경로를 타지 않는다.
- **관련 위치**: `scripts/seed-stations/generate-districts-sql.mjs`(guard 생성부).
  ★ 생성된 SQL을 직접 고치는 것이 아니라 생성기를 고치고 재생성해야 한다.

## 23. station_aliases 시드 생성기가 없다

- **현재 상태**: migration 026이 `station_aliases` 테이블과 `normalize_station_query()` /
  `hangul_chosung()` 함수를 만들지만, **행을 채우는 생성기는 아직 만들지 않았다.**
  빈 테이블이어도 깨지는 곳은 없다 — 이 테이블을 읽는 코드가 저장소 어디에도 없다
  (migration 027~032 참조 0건, `src/` 참조 0건, 026의 두 함수는 이 테이블을 조회하지 않는
  순수 문자열 함수다).
- **남은 일**: 역 자동완성 검색을 붙이는 시점에 별도 작업이 필요하다.
  초성(`kind='chosung'`) · 공식명(`official`) · 축약어(`short`) · 옛 표기(`legacy`) 생성 +
  **`alias_normalized`는 반드시 DB 함수 `normalize_station_query()`를 통해 굽는다**
  (026:56 — 저장 시점과 조회 시점이 같은 함수를 써야 한다. JS 포팅본으로 구우면
  두 구현이 갈라지는 순간 검색이 조용히 깨진다).
- **관련 위치**: `supabase/migration_026_station_mapping_search.sql`(56, 141-178),
  `scripts/seed-stations/lib/normalize.mjs`(포팅본 - 굽는 용도로 쓰지 말 것)

## 24. 026의 두 함수는 PUBLIC(anon 포함) EXECUTE 가능하다 (기록만)

- **현재 상태**: `normalize_station_query()` / `hangul_chosung()`에 `REVOKE`/`GRANT`가
  없어 Postgres 기본값대로 PUBLIC이 실행할 수 있다.
- **판단**: 실제 위험 없음. 둘 다 `SECURITY DEFINER`가 아니고 `immutable strict`
  순수 문자열 변환이며 데이터에 접근하지 않는다. 026:29가 이 의도를 명시하고 있다.
- **대비되는 지점**: 028/029가 만든 함수는 `revoke ... from public, anon` 을 걸었는데,
  그쪽은 `SECURITY DEFINER`라 성격이 다르다. 030의 "함수 권한 위생"도 기존 6개 함수만
  대상이라 이 둘은 범위 밖이다.
- **재검토 조건**: 함수 권한 정책을 일괄 정리할 때 함께 본다.

## 25. 026 롤백 주석은 "적용 직후 빈 상태"에서만 안전하다

- **현재 상태**: 026:229-236의 롤백 주석은 `drop table station_aliases` →
  `drop table station_districts` → 함수 2개 drop 순서다. 순서 자체는 맞다(자식 먼저).
- **★ 안전한 시점이 한정된다**:
  - `seed_districts.sql` 실행 **후**에는 `drop table station_districts`가 **318행을 함께
    지운다.**
  - migration 027 적용 **후**에는 `fill_request_location()` 트리거가 그 테이블을 참조하므로
    (027:145) 테이블을 지우면 **요청서 INSERT가 전부 실패한다.**
- **재검토 조건**: 026을 되돌려야 하는 상황이 오면 위 두 가지를 먼저 확인한다.
  seed 이후 되돌리기는 롤백이 아니라 데이터 삭제다.

## 26. seed_districts.sql 실행 중 `_seed_station_ref does not exist` 관측 (2026-08-09, 원인 미확정)

- **관측**: 2026-08-09 `seed_districts.sql`을 Supabase SQL Editor에서 실행하는 도중
  `ERROR: 42P01: relation "_seed_station_ref" does not exist` 가 한 번 났다.
  **데이터는 정상이다** — INSERT는 정상 COMMIT됐고 districts 256 / station_districts 318,
  서울 25 / primary 308 / secondary 10 / 역당 분포 1→298·2→10, 경계역 10개 전부 기대값
  일치를 확인했다.

- **★ 원인은 "하단 verification 쿼리가 TEMP를 참조해서"가 아니다. 파일로 확인했다.**
  `output/seed_districts.sql`(1,073줄) 기준:
  - `COMMIT;` 은 **1028행**
  - `_seed_station_ref` / `_seed_station_match` 참조는 **12곳 전부 343~1026행**, 즉 COMMIT 앞
  - **COMMIT 이후 구문 16개는 전부 `districts` / `station_districts` / `stations` 만 조회한다
    (temp 참조 0건, 기계 확인)**

  따라서 "COMMIT 이후 TEMP가 사라져서 검증 쿼리가 실패했다"는 설명은 이 파일에 대해서는
  성립하지 않는다. **이 항목을 근거로 하단 검증 쿼리를 고치면 안 된다** — 고칠 대상이 없다.

- **남은 가설 (미확정)**:
  1. 실행자가 스크립트 **일부 구간을 따로 선택 실행**했다. 668/682/685행(`DO $match$` 및
     `_seed_station_match` INSERT)은 `_seed_station_ref` 를 참조하므로, 그 구간만 다시 돌리면
     정확히 이 에러가 난다.
  2. SQL Editor가 스크립트를 문장 단위로 쪼개 각각 별도 트랜잭션으로 보냈다.
     그 경우 `ON COMMIT DROP` 때문에 temp 가 즉시 사라진다. 다만 이 가설이 맞다면
     **최종 INSERT도 실패했어야 하는데 데이터는 정상**이라 단독으로는 설명되지 않는다.

- **실질 개선 방향 (원인과 무관하게 유효)**: 이 SQL은 **TEMP 테이블을 아예 쓰지 않아도 된다.**
  `_seed_station_ref` / `_seed_station_match` 는 CTE(`WITH ... AS (VALUES ...)`)로 바꿀 수 있고,
  그러면 세션·트랜잭션 수명에 얽힌 이 실패 모드 자체가 사라진다. 부분 재실행에도 견딘다.
  다만 `DO $match$` 의 사전 검사(expected/0-match/multi-match)를 CTE로 옮기려면 구조를
  다시 설계해야 한다 - 단순 치환이 아니다.
  대안으로 **one-shot 실행부와 verification 쿼리를 별도 파일로 분리**하면 부분 재실행
  유인이 줄어든다.

- **재검토 조건**: 다음에 generator를 손댈 때 22번(guard `to_regclass`)과 함께 처리한다.
  **이미 실행이 끝났고 데이터가 정상이므로 지금 고치지 않는다.**
- **관련 위치**: `scripts/seed-stations/generate-districts-sql.mjs`(TEMP 테이블 생성부,
  `DO $match$`, verification 생성부)

## 현재 DB 상태 (2026-08-09 기준)

| 테이블 | 행 수 | 비고 |
| --- | --- | --- |
| `districts` | 256 | 026 이후 시드 완료 |
| `lines` | 18 | |
| `stations` | 308 | |
| `station_lines` | 405 | |
| `station_districts` | 318 | primary 308 / secondary 10 |
| `station_aliases` | 0 | 시드 생성기 없음(23번) |

적용된 migration: **024 / 025 / 026** (022 / 023 포함). **027 이후 미적용.**
026 정규화 검증 t01~t21 전부 true(초성 통과 t15/t16 포함).
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

# 진행 상태 (2026-08-07 마감 기준)

> **다음 세션은 이 섹션부터 읽는다.** 아래 "지금 어디까지 왔나"와 "다음에 할 일"만
> 보면 이어서 작업할 수 있다. 세부 근거는 각 항목이 가리키는 아래 섹션에 있다.

## 지금 어디까지 왔나

| 대상 | 상태 |
| --- | --- |
| **migration 022** (관계 기반 프로필 RPC 2개) | **적용 완료** |
| **migration 023** (profiles 원본 SELECT 잠금 + nickname 트리거) | **적용 완료 · 검증 전부 통과** |
| **migration 024~032** | **파일 작성 완료. 전부 미적용** |
| **프론트 A** (022 RPC 전환) | **커밋 `9ada5b8` 배포 완료 · 브라우저 검증 통과** |
| **프론트 B** (`resolve_chat_customer_id` 전환) | **미착수.** 030의 HARD PREREQUISITE |
| 지역 라우팅 | **전혀 미검증.** 028 미적용이라 담당 지역 개념 자체가 아직 없다 |

**현재 프로덕션 상태 요약**: 고객은 자기 요청서의 응답과 채팅 상대 정보를 022 RPC로만
받는다. 중개사는 고객 `profiles` 원본 행을 관계가 있어도 읽을 수 없다(실측 확인).
중개사 요청서 목록은 **아직 전국 전체**이며 이는 정상이다(라우팅은 029/030 이후).

### 2026-08-07에 끝낸 것

- **022 적용** — ACL 확인 통과(`postgres=X | authenticated=X | service_role=X`,
  PUBLIC·anon 없음), `security_definer=true`, `search_path` 고정 확인
- **테스트 계정 신규 생성 취소** — 기존 계정 4개로 충분해서 `+test1~3`을 만들지 않았다.
  → 「검증용 계정·데이터」
- **관계 데이터 생성** — 요청서 `cc193972-...`(신촌) ← 응답 매물 `dz`(`c8ab5299-...`)
  ← 채팅방 `a325fc9a-...` + 양방향 메시지
- **Step 7 스모크(S1~S4) 통과** → 「실행 결과」
- **프론트 A 코드 수정·배포·브라우저 검증(T27 포함) 통과** → 「프론트 A」
- **023 적용 + 전체 검증 통과** — T17~T19 / T22~T25 / T31~T33 / 트리거 revoke 실측
  → 「023 적용 완료」

### 남아 있는 미결 3건

1. **T26 실제 승인 / T34 승인 트랜잭션** — `test3@naver.com`이 유일한 심사 대기 계정이라
   승인하면 소진된다. **실행 직전 사용자 판단 필수** → 「test3은 1회용이다」
2. **요청서 `cc193972-...`의 `response_deadline` 7일 연장** — 테스트용 임시 변경이
   그대로 남아 있다. 원복 여부는 사용자가 정한다 → 「임시 변경」
3. **발견 사항 3건** (응답 매물 상세 보기 없음 / 24시간 문구 하드코딩 / MyPage i18n 누락)
   — 전부 기록만 했고 고치지 않았다 → 「발견 사항」

## 다음에 할 일 (이 순서를 지킨다)

지역 입력 구조화 + 중개사 라우팅. **각 단계의 판정 기준은 「지역 라우팅 검증 시나리오」에
미리 확정해 뒀다** — 결과를 보고 기준을 맞추지 않기 위해서다.

1. **카카오 REST API 키 준비 — 용도 확정됨 (2026-08-07)**
   - **용도: 역 좌표 → 시군구 코드 역변환 (`coord2regioncode`). 이것 하나뿐이다.**
   - 필요한 이유: `station_districts.is_primary` 판정 기준이 **"역 대표 좌표가 속한 구"**
     이고(`026` 설계 의도), 공공데이터에는 시군구 **코드**가 직접 들어 있지 않다.
     도로명주소는 텍스트라 코드가 아니므로 `districts.code`와 조인할 수 없다
   - **시드 생성 1회성이다. 런타임에는 호출하지 않는다** — 앱 번들에 REST 키가 들어갈 일이
     없고, 쿼터·장애가 서비스에 영향을 주지 않는다
   - 지도용 JS 키(`VITE_KAKAO_MAP_API_KEY`, 이미 `.env`에 있음)와 **별개의 REST API 키**다.
     같은 카카오 앱의 "플랫폼 키" 메뉴에서 발급받는다
   - 이 키는 시드 스크립트 실행 환경에만 두고 **저장소에 커밋하지 않는다**(public 저장소)
2. **시드 스크립트 작성** (`scripts/seed-stations/`, 아직 없는 디렉터리)
   - 소스 우선순위는 `025` 설계 의도에 이미 정해져 있다: 좌표는 `display_order`가 가장 낮은
     노선 값(평균 금지), `name_ko/en/hanja`는 국가철도공단 표준데이터, `name_ja/zh`는
     서울교통공사 역명다국어표기, 불일치 표기는 버리지 말고 `station_aliases`에
     `kind='legacy'`로 등록
   - **검수 리포트 `merge_report.csv`를 함께 만든다.** `needs_review=true` 건만 사람이 본다
   - 병합 규칙 주의: 신촌(2호선/경의중앙선)은 **자동 병합하지 않는다**
3. **024~027 적용** (districts → stations/lines → station 매핑·검색 → requests 위치 컬럼)
   - `026` 적용 직후 정규화 함수 확인 쿼리를 먼저 돌린다. **정규화가 틀린 채로 시드를
     만들면 별칭 전체를 다시 만들어야 한다**(`026:195-199`)
4. **시드 적재** (SQL Editor = postgres 전용. 쓰기 정책이 없다)
5. ~~**`region_text` 백필**~~ — **2026-08-10 철회. 이 단계는 수행하지 않는다.**
   기존 8건이 전부 만료됐거나 테스트용이라 백필 대상이 아니다(38번 참고).
   `cc193972-...`를 2호선 신촌역으로 백필한다는 위 서술도 함께 철회한다 — 그 요청서가
   바로 테스트용 deadline 연장분이다. 신촌 선택은 미결정으로 남긴다(36번).
   ★ 대신 **라우팅 검증은 자동완성 UI 배포 후 새 요청서로 수행한다.**
6. **LocationStep UI** (`RequestWizard` 지역 단계 → 역 선택)
   - 없으면 **신규 요청서가 계속 `station_id=null`로 생성돼 라우팅 밖으로 샌다.**
     백필로 과거만 메워도 새는 구멍이 남는다
7. **028 적용** → `realtor_service_areas` 생성
   - 적용 직후 `select count(*) from realtor_service_areas` = **0** 을 기록한다.
   - ★ **이것을 "R7 기준선"이라고 부르지 않는다(2026-08-10 정정).** 0행은 R7 의
     *전제 조건*일 뿐 R7 자체가 아니다. R7 은 `list_open_requests_for_realtor()` 로
     "영업지역 없는 중개사가 0행을 본다"를 검증하는 것이고, 그 함수는 **029 가 만든다.**
   - 028 직후에는 migration_010 의 `requests_select_own_or_realtor` 가 살아 있어
     **지역과 무관하게 모든 open 요청서가 보이는 것이 정상 동작**이다. R7 이 검증하려는
     명제 자체가 이 시점에는 성립할 수 없다. **R7 판정은 029 적용 후로 미룬다.**
8. **영업지역 지정** (사용자가 admin으로) — `aaa`=서대문구, `test2`=강남구.
   코드값은 시드 적재 후 `districts` 테이블과 대조해 실물 확인
9. **029 적용 + 프론트 B 배포** — 라우팅 RPC 전환 + `resolve_chat_customer_id` 전환.
   프론트는 `RealtorDashboard` / `RealtorRespond` / `chat.api.js` 3곳
10. **030 적용** — ⚠ **프론트 B 없이 먼저 적용 금지.** 중개사 신규 채팅 진입이 막힌다
    → 「HARD PREREQUISITE」 및 `migration_029` 헤더

**031·032는 위가 전부 끝난 뒤에 판단한다.** 031은 중복 응답이 생긴 뒤에는 무손실 롤백이
불가능하고(위 4번 항목), 적용 전 **5개 테이블**(`properties`·`property_images`·`favorites`·
`chat_rooms`·`chat_messages`) 백업이 선행 조건이다.

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

## T31~T33 — nickname 트리거. 전부 통과 (2026-08-07)

| | 결과 |
| --- | --- |
| **T31** 중개사 본인의 nickname 변경 | **차단.** `ERROR 42501: 승인된 중개사의 사무소명은 관리자만 변경할 수 있습니다.` (CONTEXT: `prevent_realtor_nickname_change() line 6 at RAISE`) |
| **T32** admin(dada)이 그 중개사의 nickname 변경 | **성공.** `T32-임시명` 확인 후 rollback |
| **T33** 중개사의 `preferred_language` 변경 | **성공.** `ja` 확인 후 rollback. nickname 트리거가 간섭하지 않는다 |

T31의 CONTEXT가 트리거 함수를 정확히 가리키므로 **트리거가 실제로 발동했음**이 확정된다
(예외 없이 통과했다면 트리거가 죽은 것이다). T32는 `auth.uid() = old.id` 조건이 호출자와
대상이 다를 때 통과한다는 설계대로 동작했고, T33은 첫 조건(`nickname is distinct`)이
false여서 통과했다. 셋 다 `begin`/`rollback`이라 **실데이터 변경 없음.**

## ✅ `preferred_language` 원복 확인 완료 (2026-08-07)

검증 과정에서 `ja`로 바뀌었던 `user@naver.com`(`4b20f04b-...`)의 `preferred_language`를
앱에서 한국어로 되돌린 뒤 DB에서 `ko` 확인했다. **남은 임시 변경 없음.**

(요청서 `cc193972-...`의 `response_deadline` 7일 연장은 **아직 그대로다.** 이건 별건이고
원복 여부는 사용자 판단 대상 — 위 「임시 변경」 항목 참고.)

## 023 검증 종료 — 전부 통과

T17~T19(정책 효과) / T22~T25(정상 기능 회귀) / T31~T33(트리거) / 트리거 revoke 실측 /
언어 원복. **023 관련 검증은 여기서 끝난다.**

**미실시로 남는 것 (023과 분리)**
- **T26 실제 승인** — 승인 UI가 열리고 기존 신청서가 조회되는 것까지만 확인했다
- **T34 customer→realtor 승인 트랜잭션** — `test3@naver.com` 소진 문제로 보류.
  실행 전 반드시 사용자 판단을 받는다(위 「test3은 1회용이다」 항목)

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

# 사용자군별 기기 사용 패턴 (2026-08-07 확정 · 화면 설계의 판단 기준)

**결론: 전 화면 반응형이 필요하다.** "이 화면은 모바일 전용"이라는 단순화를 하지 않는다.
아래는 추정이 아니라 **확정된 제품 판단**이며, 화면 설계에서 다툼이 생기면 이 절을 기준으로
판단한다.

## ★ RequestWizard 데스크톱 레이아웃은 필수다. 선택 사항이 아니다

- **에이전트가 사무실 PC에서 요청서를 작성하는 것이 실제 업무 흐름**이다
- **고객도 입국 전 노트북으로 알아보는 단계**가 있다
- 현재 모바일 전용이라 넓은 화면에서 **좁은 컬럼 하나만** 뜬다 (원인은 아래 「현재 상태」)

## 고객

- **모바일·데스크톱 둘 다 필요**
- **입국 전**: 해외에서 노트북으로 알아본다. 학교·비자·항공권을 찾다가 방도 같이 본다
- **응답 비교는 데스크톱이 유리하다.** 부동산 3곳이 매물 5개씩 보내면 15개인데
  모바일 세로 스크롤로는 비교가 성립하지 않는다
- **입국 후와 채팅은 모바일**

## 에이전트 (care_agent)

- **모바일·데스크톱 둘 다 완전히 지원되어야 한다. 어느 쪽도 선택 사항이 아니다**
- 밖에서는 고객을 직접 만나거나 이동 중에 폰으로 처리한다
- 사무실에서는 PC로 여러 건을 앉아서 처리한다
- **요청서 작성을 포함한 모든 기능이 양쪽에서 완결**되어야 한다

## 중개사

- **모바일**: 요청서 알림 확인, 채팅 응답. 짧고 빈번하며 **외근 중에도 필요**
- **데스크톱**: 매물 등록(사진 다수·주소·설명), 요청서 목록 검토
- **"중개사 = 데스크톱"으로 단순화하면 안 된다**

## 화면별 우선 설계 기준

| 화면 | 기준 |
| --- | --- |
| 요청서 작성 마법사 (`RequestWizard`) | **양쪽 필수** |
| 응답 목록·비교 (`ResponseStatus`) | **양쪽 필수.** 비교는 데스크톱이 더 중요 |
| 채팅 (`Chat`) | 모바일 우선, 데스크톱도 지원 |
| 매물 등록 폼 (`RealtorRespond` 등) | 데스크톱 우선 |
| 중개사 요청서 목록 (`RealtorDashboard`) | 데스크톱 우선 (정보량이 많음) |
| 중개사 알림·요청서 상세 | 모바일 우선 |

## 현재 상태 — 1차 스캔 (2026-08-07, 정식 조사는 화면 작업 시작 시)

전 화면이 모바일 기준(375px)으로 만들어져 있다. 아래는 화면 개선 작업의 **출발점 데이터**일
뿐이고, 화면별 실제 레이아웃 붕괴 여부는 확인하지 않았다.

**근본 원인은 개별 화면이 아니라 공용 컨테이너다:**

```css
/* src/styles/theme.css:47 */
.frame { width: 100%; max-width: 430px; min-height: 100vh; ... }
```

`.frame`은 거의 모든 페이지의 최상위 래퍼인데 **`max-width: 430px`를 넓히는 미디어 쿼리가
없다.** `theme.css`의 유일한 `@media (min-width: 1024px)`는 탭바가 사이드바로 바뀔 때
좌측 여백만 확보하고, 바로 위 주석이 **"`.frame`의 max-width는 화면별 다음 단계에서 확장"**
이라고 적어 미뤄둔 상태다. 즉 개별 화면 CSS를 아무리 고쳐도 **430px 컬럼은 그대로다.**
반응형 작업은 이 컨테이너 정책을 먼저 정해야 한다.

CSS 39개 중 `@media`를 가진 파일은 25개인데 **대부분 Landing/LandingV3 계열**이다.
브레이크포인트는 `1024px`(25건) / `768px`(4건) / `900px`(1건)로 섞여 있어 정리가 필요하다.

**`@media`가 하나도 없는 파일 14개** — 위 우선순위 표와 겹치는 것이 문제다:

| 파일 | 위 표의 기준 |
| --- | --- |
| `RequestWizard.css` | **양쪽 필수** ← 가장 시급 |
| `ResponseStatus.css` | **양쪽 필수** (비교는 데스크톱이 더 중요) |
| `RealtorRespond.css` | 데스크톱 우선 |
| `AdminDashboard.css` | (운영자용. 사실상 데스크톱) |
| `Chat.css` | 모바일 우선이지만 데스크톱도 지원해야 함 |
| 그 외 | `MyPage` / `PropertyDetail` / `MapExplore` / `Login` / `SignUp` / `SignUpChoice` / `RealtorSignUp` / `RequestSuccess` / `ImageCarousel` |

`RealtorDashboard.css`는 `@media` 1건뿐이다(데스크톱 우선 화면치고 적다).

**화면 개선 작업은 이 조사부터 시작한다** — 위 스캔은 파일 존재 여부만 본 것이고,
실제로 각 화면이 1024px에서 어떻게 깨지는지는 브라우저로 확인해야 한다.

## 에이전트 요청서 작성 UI — 미착수, 결정 필요

- **아직 없다.** `createRequest()`는 항상 `created_by = customer_id = 로그인 사용자`다
  (`requests.api.js:34-35`)
- 만들 때 **고객용 `RequestWizard`를 재사용할지 별도로 만들지 판단이 필요하다.**
  `customer_id` 선택 부분만 다를 가능성이 높다
- ⚠ **그 시점에 `created_by` 권한 범위를 함께 결정해야 한다** → 위 **13번 항목**
  (에이전트가 "작성만 대행"인지 "응답 관리까지"인지. 기존 정책 4곳이 이미 `created_by`로
  응답 열람까지 허용하고 있어 문서와 구조가 어긋나 있다).
  **`createRequest()`에 `customerId` 파라미터를 추가하는 커밋 이전이 마지막 결정 시점**이다 —
  그 UI를 만든 순간부터 권한이 발현되므로 "만들면서 정하자"가 성립하지 않는다

**지금 구현하지 않는다. 위 내용은 기록이다.**

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
   ★ 2026-08-09 확정 - ① 안의 순서는 아래 하나뿐이다:
       024 → 025 → 026 → seed_stations.sql → seed_districts.sql → DB 검증 → 027
     - 026을 seed 보다 먼저 적용한다. 026은 스키마만 만들어서 행이 없어도 적용되고,
       반대로 seed_districts.sql 은 026이 만드는 station_districts 테이블이 있어야 실행된다.
     - seed_districts.sql 은 stations 308행을 전제한다(SQL 자신이 guard로 검사)
       -> seed_stations.sql 이 반드시 앞선다.
     - 027은 station_districts 에 행이 있어야 트리거가 의미를 갖는다 -> 마지막.
     - station_aliases(026 테이블)는 아직 시드 생성기가 없다. 이번 범위 밖이다.
     ※ 이전에 논의됐던 "024 → 025 → station seed → districts → 026" 순서는 폐기됐다.
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

### 배정 전 전제 조건 (④ 직전에 기록해 둘 것)

```sql
-- 028 적용 직후, 아직 아무 영업지역도 넣지 않은 상태에서
select count(*) from realtor_service_areas;   -- 기대: 0
```

★ **이 0행은 "R7 기준선"이 아니다(2026-08-10 정정).** R7 은
`list_open_requests_for_realtor()` 를 호출해 "영업지역 없는 중개사가 0행을 본다"를
검증하는 것이고, **그 함수는 029 가 만든다.** 028 직후에는 존재하지 않아 호출할 수 없다.

게다가 028 직후에는 migration_010 의 `requests_select_own_or_realtor` 가 살아 있어
`role='realtor'` 이기만 하면 **모든 open 요청서가 보인다.** 즉 이 시점의 정상 동작은
"지역 없으면 0행"이 아니라 "지역과 무관하게 전부 보임"이다.

**R7 판정은 029 적용 후에 한다.** 여기서 기록하는 것은 배정 전 출발점이 0이었다는
사실 하나뿐이다.

---

# line identity 모델 — service-line 계층 승격 재검토 조건 (2026-08-08)

역 시드 병합(`scripts/seed-stations/`)은 **2계층 모델**을 쓴다.

```
raw source data  →  line identity  →  (향후) display line
```

`line identity` 의 기본값은 표준데이터의 **노선번호**이고, 원천이 하나의 번호에 두 개 이상의
실체를 담은 경우에만 명시적 reference rule 로 분리한다. 정의는
`scripts/seed-stations/line-identity.mjs` 에 근거와 함께 들어 있다.

| 구분 | 내용 |
| --- | --- |
| segment split | `I4102`(경원선)을 역번호 1015 경계로 분리. 서울 19행 적용 |
| name split | `I4108` 을 raw 노선명(경의중앙선/경춘선)으로 분리. 서울 18행 적용 |
| transfer-code adapter | 환승노선번호 6종(`I41K4` `I41K1` `S11S1` `S1101` `S1104` `I41D1`) 번역 |

**raw → source → service 3계층은 만들지 않았다.** 서울 범위에서 실제 분기는 `I4102` 하나뿐이고,
남는 미해결 대부분이 identity 문제가 아니라 원천 데이터 결손이라 계층을 늘려도 줄지 않기 때문이다.

## 자동 병합 동결 시점의 실측 (2026-08-08)

```
source row 406  ->  candidate group 307  ->  physical cluster 331
decision:  merge 58 / single 226 / hold 47
rule (5):  candidate pair 111  ->  resolved 87 / unresolved 24
```

### unresolved 24 pair 의 성격 — 세 가지를 구분한다

| 구분 | pair 수 | 내용 |
| --- | --- | --- |
| **A. 원천 데이터 결손** | **14** | 상대 노선을 환승 목록에 아예 적지 않음 (공덕·강남·신논현·신설동 등) |
| | **4** | 환승노선번호 자체가 공란 (김포공항 김포골드라인 행, 보라매 7호선 행) |
| **B. 원천 데이터 오류** | **1** | 중랑 — 경춘선 행이 상대를 이름으로는 "경의중앙선"이라 적고 코드는 `I41K2`(자기 자신)를 넣음 |
| **C. 정책적 hold** | **5** | 1호선 계열 source identity 분산 (온수·창동·석계·도봉산·종로3가) |

**★ C 5건은 모델의 한계가 아니다.**
`I4101`(경부선) / `I1101`(경인선) / `I4102@N`(경원선 북부)은 승객 관점에서 모두 1호선이지만,
**서울 시드 단계에서 1호선 service family 를 추가하지 않기로 결정했기 때문에** 안전하게
hold 로 남긴 것이다. 원리적으로 해결 불가능한 것이 아니라 **재검토 가능한 정책적 보류**다.

경기·인천 확장이나 데이터 갱신 시 이 5건을 "원천 데이터라 못 고친다"로 읽으면 안 된다.
1호선 family 를 추가할지는 그때 아래 「재검토 조건」에 따라 다시 판단한다.
A·B 와 달리 **우리 쪽 결정으로 바뀔 수 있는 항목**이다.

## 재검토 조건

경기·인천 등 범위 확장 또는 데이터 갱신 시 아래 중 하나라도 해당하면
**service-line 계층 도입을 재검토한다.**

- **(a)** 동일 source identity 가 여러 service identity 로 갈리는 패턴이
  서로 다른 source line 에서 반복될 때
- **(b)** segment/reference mapping 이 서로 다른 source line 에서 3개 이상으로 늘어날 때
- **(c)** 동일 service identity 해석을 merge 뿐 아니라 검색·표시·라우팅 등
  2개 이상의 기능이 공유해야 할 때

**개수만으로 자동 승격하지 않는다.** 예외가 4개여도 서로 독립된 단순 source-data quirk 면
현 방식이 낫고, 2개여도 같은 service line 개념이 여러 곳에서 반복되면 계층화가 맞다.
설계 재검토 기준이지 실행 시 판정 기준이 아니다.

### 현재 상태 (2026-08-08) — 2-family 구조를 유지한다

| family | acceptable identity set | 근거 역 |
| --- | --- | --- |
| 경의중앙 (`I41K4`) | `{ I4108@GJ, I4102@S }` | 왕십리·이촌·옥수·용산·청량리·서울역·홍대입구·공덕·DMC |
| 경춘 (`I41K2`) | `{ I4108@GC, I41K2 }` | 광운대·상봉 |

같은 구조(하나의 raw transfer service code 가 복수 source identity 를 지칭)가 서로 다른
source line 에서 나타났으므로 조건 (a)의 성격을 띤다. 다만 두 건 모두 한국철도공사 광역철도
구간이라는 동일 원인이고, 각각 adapter 한 항목으로 흡수되므로 **이번에는 승격하지 않는다.**

### 승격 판단 기준 — 개수 조건이 아니다

**새로운 service family 가 추가로 필요해지는 시점에 service-line 계층 도입 필요성을 재검토한다.**
세 번째 family 가 생겼다는 사실만으로 승격하지 않는다. 그것도 서로 무관한 단순
source-data mismatch 하나라면 adapter 한 줄을 더 넣는 편이 낫다.

재검토가 실제로 필요한 신호는 **개수가 아니라 성격**이다:

- 동일한 service 개념이 여러 source line 에서 반복적으로 나타날 때
- merge / search / display / routing 등 **복수 기능이 같은 service identity 해석을 공유**해야 할 때
  (현재는 merge 하나만 쓴다 — 이게 2계층으로 충분한 가장 큰 이유다)
- adapter 표가 "코드 번역"이 아니라 "노선망 모델"처럼 읽히기 시작할 때

★ 1호선 계열(`I4101` / `I1101` / `I4102@N`)은 현재 family 로 묶지 않는다. 그건 1호선 전체를
하나의 identity 로 만드는 것이고 사실상 3계층 모델이다. 온수·창동·석계·도봉산·종로3가
**5 pair 는 위 「unresolved 24 pair」의 C(정책적 hold)** 이며, 수동 검수로 처리한다.
확장 시점에 1호선 family 추가를 다시 검토할 수 있다.

★ family 는 규칙 (5)의 membership 판정에만 쓴다. source identity 자체는 합치지 않으며
`coordinatePriority` 도 identity 별 값을 각각 유지한다
(`I4108@GJ`=30 / `I4102@S`=31, `I4108@GC`=37 / `I41K2`=38).

## 확장 시 먼저 확인할 것

- **`S1101`** — 서울에서는 `I4101`(1호선)이지만 **부평(인천)에서는 경인선 `I1101`** 을 가리킨다.
  인천 확장 시 단일 identity 로 확정할 수 없게 되므로 반드시 재검토한다.
- **`S1104`** — 안산과천선(`I4103`)·진접선(`I4104`)이 대상에 들어오면 4호선 계열이 늘어난다.
- **`I41K1`** — 수인선(`I28K1`)이 들어오면 분당선 계열이 둘이 된다.
- **경춘선이 두 source code(`I4108@GC` / `I41K2`)에 걸쳐 있다.** 경의중앙 계열과 같은 구조인데
  아직 계열 매핑을 하지 않았다. 광운대·상봉·중랑의 hold 원인이다.

## 좌표 선택과 표시 순서는 분리되어 있다

`config.mjs` 의 `lineDisplayOrder`(표시 순서)는 **더 이상 대표 좌표를 고르지 않는다.**
좌표는 `line-identity.mjs` 의 `coordinatePriority` 가 정한다. 두 책임이 붙어 있으면
나중에 표시 모델을 손대는 순간 이미 `requests` 에 백필된 좌표가 조용히 이동한다.

# 빌드·툴링 (2026-08-10)

## 27. UTF-8 BOM 재발 방지 — prebuild 검사 도입 완료

`666b860` 에서 `package.json` 앞에 BOM(`EF BB BF`)이 삽입돼 **Vercel 프로덕션 배포가
5개 커밋 연속 실패**했다(`666b860` / `b41602a` / `dd54503` / `c2476ca` / `2c0775c`).

원인 경로: postcss-load-config 는 `postcss.config.*` 가 없으면 fallback 으로
`package.json` 을 `JSON.parse` 하는데, `JSON.parse` 는 BOM 을 벗기지 않아 SyntaxError 가
난다 → CSS 39개 transform 실패 → 빌드 중단. **npm 은 BOM 을 벗기므로 install 은 통과하고
build 만 죽는다** — 이것이 원인 파악을 늦춘 부분이다.

근본 원인은 Windows PowerShell 5.1 의 `Out-File` / `>` / `Set-Content` 가 UTF-8
**"with BOM"** 으로 저장하는 기본 동작이다. 같은 환경에서 계속 작업하는 한 재발한다.

도입한 방지책: `scripts/check-bom.mjs` + `package.json` 의 `"prebuild"`.
tracked 파일 전체를 스캔하고 BOM 발견 시 non-zero exit 한다.

**hook(pre-commit)을 쓰지 않은 이유**: `.git/` 아래라 clone 마다 수동 설치가 필요하고,
`core.hooksPath` 로 우회해도 머신당 `git config` 1회가 남는다. 사무실·집·노트북 3대를
쓰는 환경에서 "설치를 잊으면 조용히 무방비"가 되는데, 그게 정확히 이번 실패 양상이다.
npm script 는 clone 에 딸려오므로 그 구멍이 없다.

**`.gitattributes` 와 oxlint 규칙은 후보에서 탈락**했다. git 에는 UTF-8 BOM 을 제거하는
attribute 가 없고(`working-tree-encoding` 은 인코딩 변환용이지 BOM 을 벗기지 않는다),
oxlint 은 JS/JSX 를 파싱할 뿐 파일 인코딩을 보지 않는다.

### allowlist 는 `merge_report.csv` 하나뿐이다

`lib/csv.mjs:124-125` 에 적힌 대로 이 파일의 BOM 은 **의도된 것**이다 — "BOM이 없으면
Windows Excel이 CP949로 읽어 한글 역명이 전부 깨진다". 사람이 Excel 로 여는 검수
리포트이므로 제거하면 안 된다.

★ allowlist 는 늘리지 않는 것이 기본이다. 추가할 때는 반드시 `check-bom.mjs` 주석에
이유를 남긴다. 이유 없는 예외는 나중에 "왜 여기만 예외인가"를 아무도 판단할 수 없다.

### 알려진 한계 2가지

- **git 이 없는 환경에서는 검사를 건너뛴다(exit 0).** 일부 CI 는 git clone 대신 tarball 로
  소스를 받아 `git ls-files` 가 실패한다. 거기서 빌드를 세우면 정작 막으려던 것(배포 실패)을
  직접 만드는 꼴이라 graceful skip 을 택했다. 이 검사는 **로컬 방어층**이고, BOM 이 실제로
  들어가면 CI 는 어차피 postcss 에러로 실패한다.
- **아직 `git add` 하지 않은 파일은 잡히지 않는다.** `git ls-files` 기준이기 때문이다.
  커밋 대상이 되는 순간부터는 잡힌다.

## 28. `.vscode/settings.json`(`files.encoding: utf8`)은 도입하지 않았다

에디터로 저장하는 파일에는 효과가 있고 저장소에 담기므로 3대에 자동 적용된다는 장점이 있다.
다만 현재 `.gitignore` 가 `.vscode/*` 를 막고 있어 `!settings.json` 예외 처리가 선행돼야 하고,
prebuild 가 이미 강제층이라 중복이다. 또한 **PowerShell 쓰기는 막지 못한다** — 이번 사고의
실제 경로가 그쪽이었다.

필요해지면(예: 에디터 저장으로 인한 BOM 이 실제로 재발하면) 그때 도입한다.

## 29. oxlint warning 7건 미해결

`--deny-warnings` 게이트를 도입하려면 **선행 정리가 필요하다.** 현재 oxlint 은 warning 만
있을 때 exit 0 이라 게이트로 쓸 수 없는 상태다.

`2c0775c` 시점에도 동일한 7건이 있었음을 확인했다(BOM 수정과 무관한 기존 항목):

| 파일 | 규칙 |
| --- | --- |
| `src/shared/routes/useCustomerGuardChecks.js:15` | react-hooks(exhaustive-deps) — `profile.role` 누락 |
| `src/pages/MyPage/MyPage.jsx:32` | react-hooks(exhaustive-deps) — `navigate` 누락 |
| `src/pages/RealtorRespond/RealtorRespond.jsx:25` | no-unused-vars — `navigate` 미사용 |
| `src/shared/auth/AuthProvider.jsx:13` | react(only-export-components) |
| `src/context/LanguageContext.jsx:149` | react(only-export-components) |
| `src/pages/MapExplore/MapExplore.jsx:75` | no-unused-expressions |
| `src/pages/MapExplore/MapExplore.jsx:83` | no-unused-expressions |

★ exhaustive-deps 2건은 **기계적으로 deps 에 넣으면 안 된다.** 의존성이 추가되면 effect
재실행 시점이 바뀌어 리다이렉트가 중복 발생할 수 있다. 각 건마다 의도를 확인하고 고친다.

# migration 027 적용 완료 (2026-08-10) — requests 지역 구조화 컬럼 + 파생 트리거

**적용됨.** 실행문 6개 그대로이며 migration 파일은 수정하지 않았다.
**백필은 하지 않았다** — 027 파일의 백필 구간(171~201행)은 전부 주석이고
실행되는 `UPDATE`/`INSERT`/`DELETE`는 **0건**이다.

## 적용 방식 — 명시적 트랜잭션으로 감쌌다

`BEGIN; … COMMIT;` 으로 감싸 실행했다. **027 파일 자체에는 트랜잭션 제어문이 없다**
(128행의 `begin`은 plpgsql 함수 본문이고, 211~216행의 `begin;`/`rollback;`은 주석이다).

이게 중요한 이유: 027은 `create type` / `add constraint` / `create trigger` /
`create index` 에 `IF NOT EXISTS` 가 없어 **재실행이 불가능**하다(`add column` 만 idempotent).
감싸지 않은 채 중간에 실패하면 부분 적용이 남고, 그 상태에서는 재실행도 롤백 주석 실행도
안전하지 않다. 앞으로 IF NOT EXISTS 가 없는 migration 은 같은 방식으로 감싼다.

## 적용 전 스냅샷 (원복 기준)

- master: districts 256 / lines 18 / stations 308(active) / station_lines 405 /
  station_districts 318 / station_aliases 0
- 027 객체 5개(type / function / trigger / index / constraint) **전부 부재** 확인
- 신규 컬럼 5개 **전부 부재** 확인 (PostgREST `42703` + `information_schema` 0행)
- requests: total 8 / open 2 / closed 6 / distinct_region 5 / sum_response_count 1
- `id_set_hash = dac192e14823928f992d50054efe2a82`

## 적용 후 구조 검증 — 전부 통과

| 항목 | 결과 |
| --- | --- |
| 신규 컬럼 5개 | `district_code` text NULL / `location_lat` float8 NULL / `location_lng` float8 NULL / `location_type` location_type **NOT NULL** default `'station'::location_type` / `station_id` uuid NULL |
| 기존 8건 | `location_type='station'` 8행, 나머지 4개 컬럼 **전부 NULL** 8행 |
| 데이터 불변 | `id_set_hash` 적용 전후 **동일**(`dac192e1…`). total 8 / open 2 / closed 6 / distinct_region 5 / sum_response_count 1 전부 동일 |
| 객체 | 5개 전부 생성 확인 |
| 트리거 | `UPDATE OF` 목록에 **`status` 미포함**(position=0) 확인 |

트리거의 `status` 미포함은 단순 확인 항목이 아니다. 027:19-20 이 내건 **"작성 시점의 구를
고정한다"** 는 설계 원칙이 실제로 성립하는지를 결정한다. `status` 가 포함됐다면
`closeRequest()` 의 상태 변경만으로 과거 요청서의 `district_code` 가 현재
`station_districts` 기준으로 재계산됐을 것이다.

## 현재 DB 상태 (2026-08-10 기준)

- 적용된 migration: **022 ~ 027** (028 이상 미적용)
- master: districts 256 / lines 18 / stations 308 / station_lines 405 /
  station_districts 318 / **station_aliases 0**
- requests 8건: `location_type='station'` 8 / `station_id`·`district_code`·
  `location_lat`·`location_lng` **전부 NULL 8**
- 308역 전부 `station_districts` primary 를 정확히 1개씩 보유(누락 0 / 중복 0)

## 앱 영향 — 없음

- 요청 생성: `createRequest()` 가 신규 컬럼을 보내지 않고, 트리거가 `station_id is null`
  분기로 통과시킨다. 신규 컬럼은 NULL 로 들어간다
- 조회: `requests` 를 읽는 4개 함수가 전부 `select('*')` 이고 명시 컬럼 select·
  runtime validator·`Object.keys` 열거·`{...request}` 전개가 **0건**이라 키가 늘어도 무해
- UPDATE: 앱 전체에서 `requests` UPDATE 는 `closeRequest()`(`status` 만) 하나뿐 → 트리거 미발동
- 중개사 화면: 030 미적용이라 기존 정책(`requests_select_own_or_realtor`)이 그대로 살아 있다
- RLS: 027 은 policy/grant/revoke 문이 0건이다

## ★ 라우팅 검증에는 새 요청서가 필요하다 (2026-08-10 갱신)

`requests.district_code` 는 **8건 전부 NULL** 이고 **백필하지 않기로 했다**(38번).
따라서 029/030 을 적용해도 라우팅 조건 `sa.district_code = r.district_code` 에서
기존 8건은 전부 탈락한다. 이는 **손실이 아니라 의도된 결과다** — 8건 모두 만료됐거나
테스트용이라 중개사에게 보일 이유가 없다.

당초 이 자리에는 "백필이 029 의 선행 조건"이라고 적혀 있었으나, 백필을 하지 않으므로
**029 의 선행 조건은 백필이 아니라 「station_id 가 채워진 새 요청서의 존재」**로 바뀐다.
그 요청서는 자동완성 UI 가 배포돼야 만들어진다.

→ R1~R8 라우팅 검증은 **자동완성 UI 배포 후 새로 만든 요청서**로 수행한다.

# 027 이후 후속 항목 (2026-08-10 기록)

## 30. ★ F1 — 백필 SQL 의 "…역" 접미사 함정

027 주석의 매핑 표는 대상을 **홍대입구역 / 이태원역 / 건대입구역 / 강남역** 으로 적었지만
**마스터의 실제 `name_ko` 는 접미사가 없다**(`홍대입구` / `이태원` / `건대입구` / `강남`).
반면 **`신촌역` 은 실재하며 그것이 경의중앙선 역**이다(2호선은 `신촌`).

따라서 주석 표기를 그대로 `where name_ko = '…역'` 으로 옮기면:

| 대상 | 결과 |
| --- | --- |
| 홍대입구역 / 이태원역 / 건대입구역 / 강남역 | **0행** — 백필 조용히 누락 |
| 신촌역 | **1행 — 경의중앙선** ★ 027 이 정한 기본값(2호선)과 정반대 |

0행은 눈에 띄지만 **신촌은 1행 매칭이라 성공한 것처럼 보인다.** 이게 가장 위험하다.

`LIKE` 도 쓰면 안 된다 — `%강남%` 은 `강남` 과 `강남구청` 2행, `%신촌%` 은 2행을 잡는다.
**등호 매칭만 쓴다.** 308역의 `name_ko` 는 중복이 0건이라 등호는 항상 0행 또는 1행이다.

## 31. F2 — location_type CHECK 확장 시 트리거 early return 이 위조 경로가 된다

`fill_request_location()` 129-131행의 `if new.location_type <> 'station' then return new;`
는 파생을 건너뛰고 **클라이언트 값을 그대로 통과**시킨다. 지금은
`requests_location_type_station_only` CHECK 가 막아 도달 불가다.

그러나 027:14 가 예고한 대로 **"확장 시 이 CHECK 만 교체"** 하는 순간 이 분기가 살아있는
위조 경로가 된다 — `location_type='district'` + 임의 `district_code` 가 검증 없이 저장된다.
확장 migration 을 쓸 때 **이 분기를 함께 손봐야 한다.**

## 32. F3 — 027 롤백 주석은 030/031 적용 후 실패한다

030 의 `properties_insert_realtor` 정책과 031 의 재작성본이 `r.district_code` 를 참조하고
**정책은 Postgres 가 의존성을 추적**한다. 따라서 030 이후에는
`alter table requests drop column district_code` 가 **실패**한다.
`CASCADE` 를 붙이면 정책이 함께 삭제되어 영업지역 밖 응답 삽입이 열린다.

029 의 함수들은 `language sql` + 문자열 본문이라 의존성이 추적되지 않는다 →
컬럼 DROP 은 성공하지만 **호출 시점에 깨진다**(중개사 목록·응답 화면 전면 장애).

롤백 안전 경계: **백필 시점**과 **030 적용 시점** 두 곳이다.
적용 직후(백필 전)에는 신규 컬럼에 정보가 없어 손실 없이 되돌릴 수 있다.

## 33. F4 — 027:187 의 "약 400m" 는 오기

마스터 좌표로 계산하면 2호선 `신촌`(37.555153, 126.93689)과 경의중앙선 `신촌역`
(37.559768, 126.942308)은 **약 702m** 떨어져 있다(Δlat ≈ 514m, Δlng ≈ 478m).
판단을 바꾸는 수치는 아니지만 "400m 라 사실상 같은 곳"이라는 인상으로 결정하면 근거가 틀어진다.
migration 파일은 수정하지 않으므로 여기에만 기록한다.

## 34. F5 — "위치 컬럼을 UPDATE SET 에 싣지 않는다" 는 호출 규약

Postgres 의 `UPDATE OF` 는 **값이 바뀌었는지가 아니라 컬럼이 SET 목록에 등장했는지**로
판정한다. 현재는 `closeRequest()` 가 `status` 만 SET 해서 트리거가 안 돈다.

★ 요청서 수정 UI 를 만들 때 행 전체를 되돌려 보내는 방식
(`.update({ ...request, ...changes })`)을 쓰면 `district_code` 가 SET 에 포함되어
**재계산이 일어난다.** 스냅샷 불변성은 트리거가 아니라 이 호출 규약이 지키고 있다.

## 35. F6 — 8건 실데이터 대조는 아직 하지 못했다

로컬에 supabase CLI·psql 이 없고 `.env` 에는 anon key 만 있다(service_role 없음).
anon 으로 `requests` 를 조회하면 RLS 가 차단해 0행이다. 따라서 request id / 생성일 /
`region_text` 의 **실제 문자열**은 확인되지 않았고, 건수 분포는 027:173-175 에 기록된
실측값을 인용한 것이다.

★ 백필 SQL 은 `region_text` 등호 매칭에 의존하므로, **실행 전에 SQL Editor 에서
`select region_text, count(*) from requests group by 1` 로 실제 문자열을 먼저 확인**해야 한다.

## 36. ★ D1 — 신촌 station_id 는 미결정으로 남긴다 (2026-08-10 결정 철회)

**2026-08-10 오전에 "2호선 `신촌`으로 백필"로 결정했으나 같은 날 철회했다.**
백필 자체를 하지 않기로 했으므로(38번) 신촌을 고를 이유가 사라졌다.

- 2호선 `신촌` = `6d6e0a4e-e88b-4ce6-8eca-b84c7291ab9c` (11410 서대문구)
- 경의중앙선 `신촌역` = `19a92d0f-d4bb-4afa-90f5-848a8580a489` (11410 서대문구)

두 역 모두 primary district 가 11410 으로 같아 **라우팅 결과에는 차이가 없다.**
차이는 `station_id` 와 지도 핀 좌표(약 702m 거리)뿐이다.

★ **어느 쪽도 선택하지 않은 상태가 현재의 정답이다.** 근거 없이 하나를 골라 두면
그 값이 나중에 수요 분석·통계에서 사실처럼 취급된다. `line_code` 를 NULL 로 둔 것,
`source_version` 을 추측하지 않은 것과 같은 원칙이다.

앞으로 신촌을 고를 필요가 생기는 경우는 **자동완성 UI 에서 사용자가 직접 선택할 때**뿐이며,
그때는 추정이 아니라 사용자의 실제 선택이므로 이 항목이 해소된다.
(자동완성 목록에서 `신촌`과 `신촌역`이 어떻게 구분 표시될지는 UI 설계 시 별도 판단 —
노선명 병기가 필요하다.)

## 37. D3 — station_aliases 시드가 자동완성 UI 의 실질적 선행 조건

`station_aliases` 가 **0행**이라 별칭 기반 검색이 전부 죽어 있다.

| 검색 입력 | alias 없이 가능한가 |
| --- | --- |
| 한글 정확 prefix (`홍대` → 홍대입구) | ✅ `stations.name_ko` 직접 prefix |
| 초성 (`ㅎㄷ`) | ❌ 026:22 가 초성을 별칭 행(`kind='chosung'`)으로 설계 |
| 영문 (`hongdae`) | ❌ 별칭 행 필요 |
| 일본어 / 중국어 | ❌ 별칭 행 필요 (026:71) |

외국인 대상 서비스에서 다국어·영문 검색이 안 되는 자동완성은 반쪽이다. 게다가 마스터에
`홍대입구`(접미사 없음)와 `신촌역`(접미사 있음)이 섞여 있어 `name_ko` 직접 매칭만으로는
사용자가 "신촌"을 쳤을 때 `신촌역`이 안 뜨는 불일치가 생긴다. TODO 23번과 같은 항목이다.

★ DB migration dependency 와 frontend rollout dependency 는 다르다. 자동완성 UI 는
025·026·027 만으로 구현 가능하며 028~032 가 필요 없다. 오히려 032 가 "LocationStep UI 가
배포되어 있을 것"을 명시적 전제로 요구하므로 **UI 가 028~032 보다 먼저** 나와야 한다.

## 38. ★ 기존 requests 8건은 백필하지 않는다 (2026-08-10 결정)

**기존 requests 8건은 백필하지 않기로 결정.**
closed 6건 전부 만료, open 2건 중 1건도 만료.
나머지 1건(`cc193972-...`)은 테스트용 deadline 연장분이라 실사용 데이터가 아니다.
**027:171-201 의 백필 계획은 채택하지 않는다.**
라우팅 검증(R1~R8)은 자동완성 UI 배포 후 `station_id` 가 정상 입력된 새 요청서로 수행한다.

`response_deadline` 실측 (2026-08-10):

| 상태 | 건수 | past_deadline |
| --- | --- | --- |
| open | 2 | 1 |
| closed | 6 | 6 |
| **합계** | **8** | **7** |

만료되지 않은 1건도 테스트 목적으로 deadline 을 인위 연장해 둔 요청서다.
결과적으로 **8건 중 실사용 데이터는 0건**이다.

### 이 결정이 바꾸는 것

- **36번(신촌) 해소** — 고를 이유 자체가 사라져 미결정으로 남긴다
- **30번(F1 접미사 함정)은 여전히 유효** — 백필에는 안 쓰지만 `station_aliases` 시드,
  자동완성 매칭 등 **이름으로 station 을 찾는 모든 코드**에 그대로 적용되는 함정이다.
  마스터에는 접미사 없는 `홍대입구` 와 접미사 있는 `신촌역` 이 섞여 있다
- **35번(F6) 일부 해소** — `region_text` 실제 문자열 확인은 백필 전제였으므로 불필요해졌다.
  다만 8건의 실데이터를 로컬에서 못 읽는다는 사실 자체는 그대로다
- **「다음에 할 일」 5단계 삭제** — 그 자리에 자동완성 UI 가 들어온다

### 기존 8건을 어떻게 둘 것인가

지우지 않고 그대로 둔다. `station_id`/`district_code` 가 NULL 이라 029 라우팅에
잡히지 않으므로 중개사에게 노출되지 않는다.

★ 다만 **032 의 `requests_station_location_complete` CHECK 를 VALIDATE 할 수 없다.**
이 8건이 `location_type='station'` 인데 `station_id` 가 NULL 이라 위반 행으로 남는다.
032:56-57 이 예상한 상황이며, 그 주석대로 **NOT VALID 상태로 두고 VALIDATE 를 생략**한다.
전부 만료·테스트 데이터라 피해가 없다. 032 적용 시 이 판단을 기록할 것.
(대안: 032 직전에 8건을 삭제하면 VALIDATE 가 가능해진다 — 운영 데이터 삭제이므로
별도 승인 사안이다. 지금 결정하지 않는다.)

# station_aliases 시드 완료 (2026-08-10)

**적재됨.** `npm run seed:stations:generate-alias-sql` 로 만든
`output/seed_station_aliases.sql` 을 SQL Editor 에서 실행했다.

## 실측 결과

| 항목 | 값 |
| --- | --- |
| station_aliases | **1,364** |
| official | 936 (ko 308 / en 308 / **ja 222** / **zh 98**) |
| chosung | 308 |
| legacy | 120 |
| station coverage | **308 / 308** (orphan 0) |

검색 검증: `홍대` → 홍대입구 / `ㅎㄷ` → 학동·행당·홍대입구 /
`gang` → 강남·강동 등 / 신촌 2역 각각 alias 6개.

★ **중국어 coverage 는 `name_zh` 98/308 = 31.8%** 다. `name_hanja` 는 한국식 한자
역명이지 중국어 역명이 아니므로 합쳐서 93.5% 라고 말하지 않는다. 한자는 품질 정제 후
별도 보조 검색 계층으로 다룬다(후속 증분 시드).

## 39. seed SQL 의 verification 쿼리가 TEMP 테이블에 의존한다

**seed SQL 의 TEMP 테이블은 Supabase SQL Editor 에서 COMMIT 이후 참조할 수 없다.**
`seed_districts.sql` 과 `seed_station_aliases.sql` 양쪽에서 재현됐다.
INSERT 는 정상 완료되므로 실행에 영향은 없으나 **실행자가 실패로 오인한다.**
다음에 generator 를 손댈 때 verification 쿼리를 TEMP 비의존 형태로 바꿀 것.

원인: TEMP 테이블을 `ON COMMIT DROP` 으로 만들기 때문에 COMMIT 시점에 사라진다.
`seed_station_aliases.sql` 은 COMMIT 이후 구간이 이미 TEMP 를 참조하지 않도록 작성했지만
(생성 시 검증함), 실행자가 파일 전체를 한 번에 돌리면 SQL Editor 가 마지막 문장의 결과만
보여주는 것과 맞물려 혼동이 남는다. 근본 해결은 verification 을 **별도 파일로 분리**하거나
TEMP 대신 `VALUES` 인라인으로 기대값을 적는 것이다.

## 40. ★ 032 적용 전 프론트 전제 — 2개 중 1개만 충족

`migration_032_request_constraints.sql:4-6` 이 적용 전제로 두 가지를 요구한다.

| # | 전제 | 상태 |
| --- | --- | --- |
| ① | LocationStep 자동완성 UI — `station_id` 를 실제로 저장할 것 | ✅ **완료** (2026-08-10) |
| ② | `extra_note` maxLength=300 + 글자 수 카운터 | ✅ **완료 · 검증 통과** (2026-08-11) |

**→ 032 의 프론트 적용 전제 ①② 가 모두 충족됐다.** 이제 032 를 막는 것은 프론트가
아니라 **031(5개 테이블 백업 선행)** 뿐이다.

**②는 2026-08-11 에 구현·배포·브라우저 검증까지 마쳤다.** 032 를 기다리지 않고 먼저 넣었다 — 032:11-14 가
말한 순서 문제 때문이다(UI 가 먼저 제한해야 사용자가 입력 중에 안다). 미리 배포해서
잃는 것이 없고, 그 사이 300자 초과 요청서가 더 쌓이지 않아 나중에 `VALIDATE` 가
가능해질 여지도 생긴다.

구현 범위는 아래 「extra_note 300자 제한」 섹션 참고. **032 자체는 여전히 미적용이다.**

★ 032:11-14 가 명시하듯 CHECK 는 `NOT VALID` 라서 기존 행만 건너뛰고 신규 INSERT/UPDATE 는
그대로 막는다. UI 가 먼저 길이를 제한해야 사용자가 입력 중에 알 수 있다. 순서를 뒤집으면
제출 시점에 이유 없이 거부당한다.

★ ①은 2026-08-10 자동완성 배포에서 **station 선택을 필수화**하는 데까지 갔다(032 를 기다리지
않았다). 근거: 308역 전부 별칭이 있어 검색이 막힐 일이 없고, 반대로 방치하면 `station_id`
없는 요청서가 계속 쌓여 029 적용 시점에 **에러가 아니라 조용히 라우팅에서 탈락**한다.
027 의 nullable 설계는 그대로 둔다 - DB 가 nullable 인 이유는 legacy 호환과 rollout 안전이고,
프론트가 더 엄격한 것은 모순이 아니다.

# migration 028 적용 완료 (2026-08-10) — 중개사 영업지역 + 승인 흐름

**적용됨.** `realtor_service_areas` 테이블 / `service_area_type` enum /
`approve_realtor_application(uuid, text[])` / `realtor_applications.desired_district_codes`
전부 생성 확인. master 7개 테이블 건수 불변.

## 영업지역 배정 (SQL Editor 직접 INSERT)

`realtor_service_areas` **2행**:

| profile_id | 계정 | district |
| --- | --- | --- |
| `b28f1e03-db3f-4faa-be52-eba2f7d50294` | aaa | 11410 서대문구 |
| `e17d5f3d-39c8-43ed-a518-07b9b9b3fdf0` | test2 | 11680 강남구 |

★ RPC 가 아니라 직접 INSERT 를 쓴 이유: SQL Editor 는 RLS 를 우회하므로 직접 INSERT 가
정상 동작하고, 우회한다는 사실이 코드에 명시적으로 드러난다.

⚠️ 여기 처음 적었던 근거(*"SQL Editor 는 auth.uid() 가 NULL 이라 admin 검사를 통과하지 못해
42501 로 거부된다"*)는 **틀렸다.** 실제로는 통과했다 — 48번 참고.

# migration 029 적용 완료 (2026-08-10) — 중개사용 요청서 접근 RPC

**적용됨.** 함수 6개 생성 확인:
`list_open_requests_for_realtor` / `get_open_request_for_realtor` /
`get_responded_request_for_realtor` / `list_my_responses_for_realtor` /
`resolve_chat_customer_id` / `realtor_response_count`

- **정책 불변** — `requests_select_own_or_realtor` 아직 유지(제거는 030)
- **029 는 인덱스를 만들지 않는다.** 라우팅 인덱스는 027 의 `idx_requests_routing`
  (`on requests(district_code, created_at desc) where status = 'open'`) 이다
- 현재 DB: **022~029 적용**, 030+ 미적용

## 46. ✅ 해결 — 028 `approve_realtor_application` 의 admin 가드 NULL-safe 전환 (033 적용 완료)

**migration 033 적용 완료 (2026-08-10).** `supabase/migration_033_fix_approve_admin_guard.sql`

```
-  if public.current_user_role() <> 'admin' then
+  if coalesce(public.current_user_role()::text, '') <> 'admin' then
```

적용 후 실측:

| 확인 | 결과 |
| --- | --- |
| definition | 가드 줄 교체 확인. 나머지 함수 계약(시그니처/returns/language/security definer/search_path/23514/23503/ON CONFLICT)은 적용 전과 동일 |
| truth table | `admin` → false → 통과 / `customer`·`realtor`·`care_agent`·**NULL** → true → **42501** |
| privilege | PUBLIC ❌ / anon ❌ / authenticated ✅ EXECUTE |

★ **028 파일은 수정하지 않았다.** 033 이 함수를 다시 `CREATE OR REPLACE` 하는 방식이며,
017 이 016 의 같은 성격 버그를 고친 방식과 동일하다.

★ **적용 순서 ≠ 번호 순서.** 033 은 030~032 보다 번호가 뒤지만 **029 이후 / 030 이전**에
적용했다. 030/031/032 어느 것도 `approve_realtor_application` 을 재정의하지 않고,
030 의 함수 권한 재고정 대상 4개에도 이 함수가 없어(029:108-109) 덮어쓰기가 발생하지 않는다.

### 원인 (수정 전 상태 기록)

```sql
-- migration_028:128
if public.current_user_role() <> 'admin' then
  raise exception 'admin only' using errcode = '42501';
end if;
```

`current_user_role()` 은 `select role from profiles where id = auth.uid()` 라서 **행이 없으면
NULL** 을 돌려준다. SQL 3값 논리에서 `NULL <> 'admin'` 은 TRUE 가 아니라 **NULL** 이고,
PL/pgSQL 의 `IF` 는 **NULL 을 false 로 취급**한다. 즉 **가드가 발동하지 않고 그대로 통과한다.**

### 이 저장소에 이미 안전한 선례가 있다

| 위치 | 형태 | 판정 |
| --- | --- | --- |
| `migration_016:49` | `coalesce(public.current_user_role(), '') <> 'admin'` | ✅ NULL 방어 |
| `migration_017:27` | `coalesce(public.current_user_role()::text, '') <> 'admin'` | ✅ 016 의 캐스트 버그까지 수정 |
| **`migration_028:128`** | **`public.current_user_role() <> 'admin'`** | ❌ **coalesce 없음** |

부정형 가드는 016·017 이 `coalesce` 로 감싼 이유가 정확히 이것이다. 028 만 빠졌다.

★ **긍정형은 안전하다.** RLS 정책과 029 RPC 들은 `where … current_user_role() = 'realtor'`
형태라 NULL 이면 매칭되지 않아 **fail-closed** 다. 위험한 것은 부정형 `IF … <> … THEN raise`
하나뿐이다.

### 도달 경로

`grant execute … to authenticated` 이므로 **로그인한 사용자 중 `profiles` 행이 없는 상태**
(CLAUDE.md 「로그인 페이지 profile null 처리」가 다루는 그 비정상 상태)면 admin 이 아니어도
호출이 통과한다. 통과하면 임의 `p_profile_id` 를 realtor 로 승격시키고 영업지역까지 부여할 수 있다.
anon 은 `revoke` 로 막혀 있다.


## 47. `approve_realtor_application` 에 `service_role` EXECUTE 가 남아 있다

privilege 확인에서 `authenticated` / `postgres`(owner) 외에 **`service_role` EXECUTE** 가
관측됐다. **033 이 만든 것이 아니라 028 부터 존재하던 상태다** — 028 의 revoke 대상이
`public, anon` 뿐이라 `service_role` 은 회수되지 않았다.

**030 blocker 로 취급하지 않는다.** 근거: 현재 service_role key 를 frontend/Vercel 에서
사용하지 않고, `service_role` 자체가 RLS 를 우회하는 특권 role 이라 이 함수의 EXECUTE 를
회수해도 같은 작업을 다른 경로로 할 수 있다.

→ 향후 **function privilege hygiene audit** 에서 정리 여부를 판단한다. 그때 022/028/029 가
만든 함수 전체의 grantee 를 한 번에 훑는 편이 낫다(030:176-187 이 기존 6개 함수에 대해
같은 일을 한다).

## 48. 정정 기록 — "SQL Editor 에서 42501 로 막힌다"는 틀렸다

이 문서와 대화에서 *"SQL Editor 는 `auth.uid()` 가 NULL 이라 `approve_realtor_application` 의
admin 검사를 통과하지 못해 42501 로 거부된다"* 고 적은 적이 있는데 **사실이 아니다.**

실제로는 `NULL <> 'admin'` → **NULL** → PL/pgSQL 의 `IF` 가 NULL 을 false 로 취급 →
**가드가 발동하지 않고 통과**(fail-open)했다. 46번이 고친 것이 바로 이 동작이다.

SQL Editor 에서 직접 INSERT 로 영업지역을 넣은 선택 자체는 여전히 타당하다(RLS 우회가
명시적이고 의도가 드러난다). 다만 그 근거로 든 설명이 틀렸다.

## 41. 영업지역 상한 3개는 프론트 UI 제한이다

`ApproveRealtorModal.jsx` 의 `MAX_SERVICE_AREAS = 3` 이 유일한 제한 지점이다.

★ **RPC 도 DB CHECK 도 개수를 검사하지 않는다.** SQL Editor 나 RPC 직접 호출로는
3개를 넘길 수 있고 **그것은 의도된 상태다** — 운영자가 예외를 만들 수 있어야 한다.

DB 에 상한을 박지 않은 이유: 구독 등급별 차등(무료 1개 / 유료 3개)이나 사무실 단위
예외가 필요해지는 순간 migration 이 필요해진다. 지금은 상수 하나만 고치면 된다.
서버측 강제가 실제로 필요해지면 그때 새 migration 으로 CHECK 를 추가한다.
**기존 migration 은 수정하지 않는다.**

## 42. `approve_realtor_application` 의 실제 동작 2가지 (본문 확인)

**(1) 빈 배열은 RPC 가 거부한다.** `array_length('{}', 1)` 이 NULL 을 반환하므로
`p_district_codes is null or array_length(p_district_codes, 1) is null` 조건이 `{}` 를
잡아내 `23514` 를 던진다. → **프론트의 "최소 1개" 가드는 UX 용이지 유일한 방어선이 아니다.**

**(2) 재호출은 추가만 하고 교체하지 않는다.** 본문의 INSERT 가
`on conflict (realtor_id, area_type, district_code) do nothing` 이고 **DELETE 가 없다.**
`{11410}` 로 승인한 뒤 `{11680}` 으로 다시 호출하면 **두 구를 모두 갖게 된다.**

## 43. 미구현 항목 (승인 흐름 관련)

- **영업지역 교체(DELETE) 흐름** — 42(2) 때문에 "이 중개사를 강남구에서 마포구로 옮긴다"를
  화면에서 할 수 없다. 현재는 SQL Editor 에서 DELETE 후 재승인해야 한다
- **중개사 신청 화면의 희망 지역 입력** — `desired_district_codes` 컬럼은 있으나 입력 UI 가
  없어 현재 전부 NULL 이다. 승인 모달의 프리필 로직은 값이 들어오면 바로 동작하도록 이미
  작성해 뒀다(실재하는 코드만 남기고, 상한 초과분은 앞 3개만 선택 + 안내)
- **승인 화면에 현재 영업지역 표시** — 이미 승인된 중개사의 영업지역을 admin 이 볼 수 없다.
  42(2) 때문에 재승인 시 무엇이 추가되는지 모르는 상태로 누르게 된다

## 44. AdminDashboard 정렬이 `created_at` 기준이다

`listRealtorApplications()` 가 `order('created_at', desc)` 만 쓴다. 승인/반려 시각을
갱신하는 컬럼(`approved_at` / `rejected_at`)을 다루지 않아 **처리 순서가 목록에 반영되지
않는다.** 신청 건수가 적어 지금은 문제가 되지 않지만, 목록이 길어지면 "방금 처리한 건"을
찾기 어려워진다.

## 45. ★ admin 화면은 한국어 전용이다 (i18n 미적용)

`AdminDashboard.jsx` 는 모든 문자열이 한국어 하드코딩이다 —
`useLanguage` / `translations` 를 쓰지 않는다(`AdminLogin` 도 동일).

이번 승인 모달도 **화면 관례를 따라 한국어로만 작성했다.** 고객·중개사 화면과 달리 admin 은
내부 운영 도구라 다국어 요구가 없었고, 모달 하나만 4개 언어로 만들면 나머지가 한국어인
화면 안에서 오히려 어색해진다.

★ admin 다국어가 실제로 필요해지면 **화면 전체를 한 번에** 전환해야 한다. 부분 도입은
같은 화면에 두 체계가 공존하게 만든다.

## 49. R7(영업지역 없는 중개사 = 0행)은 미검증으로 남긴다 — 2026년 11월 승인 플로우로 이월

**상태: 미검증 — 대상 부재 (2026-08-11 결정)**

지역 라우팅 검증(R1~R10) 준비 중 확인했다. preflight 실측이
`realtor 2 / covered 2 / **uncovered 0**` 이라 **영업지역이 없는 중개사가 존재하지 않는다.**
R7 은 "그런 중개사가 `list_open_requests_for_realtor()` 에서 0행을 본다"를 보는 항목이라
돌릴 대상 자체가 없다.

**★ `realtor_service_areas` 를 임시로 DELETE 하지 않는다.** 검증 하나를 위해 운영 데이터를
지웠다 되돌리는 방식은 채택하지 않았다. 근거: 복구가 실패하면 같은 세션의 R3/R4 까지 무효가
되고, DB write 라 CLAUDE.md 11번 승인 대상이 되며, 얻는 정보량이 비용에 못 미친다.
(41번이 영업지역 상한을 DB 에 박지 않은 것과 같은 성격의 판단 — 되돌리기 어려운 조작보다
관측 시점을 옮기는 쪽을 택한다.)

### R2/R4 로 갈음하되 "대체"라고 적지 않는다

R7 과 R2/R4 는 `migration_029:169-174` 의 **같은 `exists(...)` 절**을 탄다.
R7 은 서브쿼리가 0행이라, R2/R4 는 `sa.district_code = r.district_code` 매칭 실패라
걸러진다 — SQL 실행 경로는 동일하다.

★ 그래도 **"R2/R4 가 R7 을 대체했다"고 기록하지 않는다.** 두 경우의 코드 경로가 같다는
것과, "영업지역 미배정"이라는 **운영 상태**가 실제로 관측됐다는 것은 다른 사실이다.
전자를 후자로 적으면 나중에 이 항목이 검증된 것처럼 읽힌다.

### 후속 실행 시점 — 2026년 11월 신규 중개사 승인 플로우 검증

신규 pending 계정을 승인할 때 **`approve_realtor_application()` 호출 직전**에
"role 은 아직 customer, 또는 role=realtor 인데 `realtor_service_areas` 0행"인 구간이
자연 발생한다. 그 시점에 해당 세션으로 `list_open_requests_for_realtor()` 를 한 번
호출하면 **DB write 없이** R7 이 판정된다.

- 관련 미결: 「T26 실제 승인 / T34 승인 트랜잭션」(`test3@naver.com` 은 1회용)
- 함께 볼 것: 43번의 미구현 3건(영업지역 교체 DELETE 흐름 / 희망 지역 입력 UI /
  승인 화면에 현재 영업지역 표시)
- 판정 기준과 절차: `VERIFY_ROUTING.md` 6번 섹션

### R6 도 같은 이유로 이월 (030 이후)

`properties` INSERT 의 영업지역 검사는 **030 이 만드는 정책**이다. 현재
`properties_insert_realtor` 는 `realtor_id = auth.uid() and current_user_role() = 'realtor'`
뿐이라(030:236 롤백 주석이 현재 정책 원문) **영업지역을 전혀 보지 않는다.**

★ 030 적용 전에 R6 을 시도하면 **INSERT 가 성공한다.** 잘못된 `properties` 행과 후속
`chat_rooms` 가 생겨 정리 대상이 된다. 030 이 닫으려는 구멍이 정확히 이것이므로,
"지금 막히는지" 확인하는 행위 자체가 데이터를 만든다. **030 적용 후에 한다.**

또한 R6 은 UI 로 판정할 수 없다 — `RealtorRespond.jsx:89-96` 이 응답 폼을 렌더하기 전에
early return 하므로 제출 버튼에 도달하지 못한다. API 레이어에서 직접 호출해야 한다.

# migration 030 적용 완료 (2026-08-11) — requests 열람 잠금 + properties 영업지역 조건

**적용됨.** 실행문 **14문**(정본 16문에서 4-2 두 줄 제외 — 아래 50번).
`begin; … commit;` 으로 감쌌다. 정본 `migration_030_secure_requests_access.sql` 은 수정하지 않았다.

실행본은 `apply_030.sql` 로 저장소 루트에 임시 생성했다가 **적용 후 삭제**했다.
재현이 필요하면 정본에서 4-2 두 줄을 빼고 `begin;`/`commit;` 을 감싸면 된다.

## 적용 전 스냅샷 (원복 기준)

| 항목 | 값 |
| --- | --- |
| S1 정책 | `requests` / `properties` 합계 **6행** |
| S2 함수 6개 | acl 전부 `=X/postgres`(PUBLIC EXECUTE) 보유 / `config` 미설정 |
| S3 데이터 | total **10** / open **4** / closed **6** / expired **0** |
| S3 해시 | `id_set_hash = 68dba2f3a202205ed102a71082b09ae0` |

★ 이 해시는 027 때 기록한 `dac192e1…` 과 다르다. 그때는 requests 8건이었고, 2026-08-11
라우팅 검증에서 2건을 추가해 10건이 됐다. **027 기록과 대조하지 말 것.**

## 적용 후 구조 검증 — 전부 통과

| 항목 | 결과 |
| --- | --- |
| V1 정책 | **6행 유지**(1:1 교체). `requests_select_own_or_realtor` 제거 / `requests_select_own_or_admin` 생성 / `properties_insert_realtor` 의 `with_check` 에 `join realtor_service_areas` 확인 |
| V2 config | 6개 함수 전부 `search_path = pg_catalog, public` |
| V2 acl | `current_user_role`·`is_pending_realtor_applicant` → PUBLIC·anon 회수, **`authenticated=X` 보존 확인** |
| V2 acl (4-2 제외분) | `handle_new_user`·`increment_response_count` → `=X/postgres` **잔존**. 제외했으므로 정상 |
| V2 acl (4-3 의도) | `get_public_listings`·`check_landline_duplicate` → `=X/postgres` **잔존**. 의도된 anon 접근 |
| V3 데이터 | **S3 와 완전 동일** (10/4/6/0, 해시 일치). 030 은 DML 0건이므로 기대대로 |

★ `authenticated=X` 보존 확인은 형식 점검이 아니다. `current_user_role()` 은 새 정책
`requests_select_own_or_admin` 과 `properties_insert_realtor` 의 **표현식 안에서 직접
호출**되고, 정책 표현식은 질의하는 사용자 권한으로 평가된다. 이 grant 가 빠졌다면
로그인 사용자의 requests·properties 질의가 전부 권한 오류로 떨어졌을 것이다.

## 동작 검증 — T1 / T2 통과

| # | 확인 | 결과 |
| --- | --- | --- |
| **T1** | 중개사 세션 `GET /rest/v1/requests?select=*` | `200`, rows **0** |
| **T2** | 중개사 세션 `rpc/list_open_requests_for_realtor` | **1행**, 대시보드에 아현 카드 정상 표시 |

★ **T1 의 0행은 R11 baseline 이 있어야만 의미가 있다.** 같은 호출이 030 직전에
`200 / rows 10 / keys 26 / customer_id 포함` 이었다(`VERIFY_ROUTING.md` R11).
baseline 없이 0행만 보면 "차단됐다"인지 "원래 없었다"인지 구분되지 않는다.

## 고객 경로 무영향 — 9행이 정답인 이유

고객 세션 `GET /rest/v1/requests?select=*` → **9행**. requests 총계는 10건이다.

이 1건 차이가 **고객 쪽 음성 대조**다:

| 소유자 | 건수 |
| --- | --- |
| `user@naver.com` legacy | 7 |
| `user@naver.com` 라우팅 검증 신규(아현·강남) | 2 |
| **소계 — 이 고객이 보는 것** | **9** |
| `ts930728@naver.com`(미사용 계정) 요청서 | 1 |
| **총계** | **10** |

새 정책 `created_by = auth.uid() or customer_id = auth.uid()` 가 **과하지도(남의 요청서
안 보임) 부족하지도(본인 것 전부 보임) 않다**는 것이 숫자로 확인된다. 10행이 나왔다면
정책이 헐거운 것이고, 7행이었다면 신규 2건이 누락된 것이다.

## 현재 DB 상태 (2026-08-11 기준)

- 적용된 migration: **022 ~ 030 + 033**. 031/032 미적용, **034 미적용(초안)**
- 030 의 4-2 두 줄은 **미적용** — 34번 파일로 이월
- requests 10건 (open 4 / closed 6). 그중 라우팅 유효(`district_code` 채워짐)는 **2건**
- `realtor_service_areas` 2행 (베스트=11410 / 대박=11680)

## 남은 검증

| # | 내용 | 상태 |
| --- | --- | --- |
| R6 | 영업지역 밖 요청서에 properties INSERT 거부 | ✅ **PASS** (2026-08-11) — 아래 참고 |
| R8 재확인 | 고객 화면 회귀(030 후) | ✅ **PASS** (2026-08-11) |
| T16 | 회원가입 / 매물 응답 | 034 로 이월 (11월) |
| R7 | 영업지역 없는 중개사 0행 | 미검증 — 대상 부재 (49번) |

## R6 결과 (2026-08-11) — PASS

베스트(영업지역 `11410`) 세션에서 강남 요청서(`11680`)에 `POST /rest/v1/properties` **1회** 시도.

```
status 403
body   { code: '42501', details: null, hint: null,
         message: 'new row violates row-level security policy for table "properties"' }
```

무변경 확인: 해당 조합 `properties` **0행** / 강남 `response_count` **0**(시도 전과 동일) /
Q0-C **대박 0/0/0 · 베스트 2/1/1 변화 없음**. **행이 생기지 않아 cleanup 불필요.**

★ **`response_count` 불변이 핵심 근거다.** `trg_increment_response_count` 는
`after insert on properties`(schema.sql:117-119)이므로, 카운터가 움직이지 않았다는 것은
**INSERT 가 아예 성립하지 않았다**는 뜻이다. "행이 생겼다가 정리됐다"와 구분된다.
에러 메시지가 떴다는 사실만으로 판정하지 않았다.

★ **positive dynamic INSERT 는 실행하지 않았다.** 아현에 실제 응답을 넣지 않아 Q0-C
baseline 을 보존했다. 정책이 과도하게 조여 **정상 응답까지 막는 경우**는 R6-pre 진리표의
`would_pass = true` 2건(정적 술어 평가)으로만 배제했다 —
**실제 성공 INSERT 검증은 migration_034 의 T16-b 소관이다(2026-11).**
"positive 까지 동적으로 검증했다"고 읽지 말 것.

판정 한계와 근거 5개 조합(브라우저 세션 실거부 / 행 0 + 카운터 불변 / R6-pre 진리표 /
T2·R1 scoped 접근 성공 / policy 정적 분석)은 `VERIFY_ROUTING.md` 8-2 에 기록했다.
SQL Editor 는 `auth.uid()` 컨텍스트가 없어 `realtor_id = auth.uid()` 절을 평가할 수 없다.

---

## 50. ★ migration 030 은 4-2 두 줄을 제외하고 적용한다 → 034 로 이월 (2026-08-11 결정)

**030 실행본에서 아래 2줄만 빼고 나머지 14문을 적용한다.** 정본
`migration_030_secure_requests_access.sql` **은 수정하지 않았다.**

```
-- migration_030:186-187  (제외)
revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.increment_response_count() from public, anon, authenticated;
```

| 파일 | 역할 |
| --- | --- |
| `apply_030.sql` (저장소 루트) | 실행본. `begin; … commit;` 으로 감쌌다. 적용 후 삭제한다 |
| `supabase/migration_034_trigger_function_privilege.sql` | 제외분 이월. **초안·미적용** |

### 왜 뺐는가

030 자신이 이 구간을 양쪽 방향으로 평가해 뒀다:

- **이득**: "returns trigger 라 직접 호출이 불가능하다(에러). **위험 0.** 위생 차원에서
  회수한다"(030:161-162) — 닫히는 실재 공격 경로가 없다
- **비용**: "★ 틀리면 **회원가입이 통째로 죽는다.** 아래 T16 으로 반드시 확인할 것.
  실패하면 이 두 줄만 되돌린다"(030:162-164)

그리고 T16 은 **새 계정 생성**(CLAUDE.md 11번 승인 대상) + **properties INSERT** 를 요구한다.
이득 0 · 검증 비용 있음 · 실패 대가 큼 → 분리가 맞다. 41번에서 영업지역 상한을 DB 에 박지
않은 것, 49번에서 R7 을 위해 `realtor_service_areas` 를 지우지 않은 것과 같은 판단 방향이다.

★ **"위험 0" 이니까 검증 없이 적용해도 된다는 뜻이 아니다.** 위험 0 은 *회수해서 얻는
보안 이득*에 대한 평가이고, *회수가 트리거를 깨뜨릴 위험*은 별개다. 후자는 T16 이 본다.

### 참고: 문서상으로는 안전하다 (그래도 T16 을 생략하지 않는다)

PostgreSQL 은 트리거 함수의 EXECUTE 권한을 **`CREATE TRIGGER` 시점에** 검사하고 발동
시점에는 재검사하지 않는다. 따라서 이미 만들어진 트리거는 EXECUTE 를 회수해도 계속
동작하는 것이 정상 동작이다. **다만 이건 문서 근거이지 이 DB 의 실측이 아니고**, 대상이
회원가입 경로라 틀렸을 때 서비스 진입점이 막힌다. 근거가 있다는 이유로 검증을 건너뛰지
않는다 — 034 의 T16-a/T16-b 를 반드시 돈다.

### 4-4 는 제외 대상이 아니다 (혼동 주의)

030 의 4-4 에도 같은 함수 2개가 등장한다:

```
alter function public.handle_new_user()                set search_path = pg_catalog, public;
alter function public.increment_response_count()       set search_path = pg_catalog, public;
```

**이 2줄은 그대로 적용했다.** 권한이 아니라 search_path 메타데이터만 바꾸고, `pg_catalog`
는 명시하지 않아도 항상 먼저 검색되므로 기능 변화가 없다(030:168-173).
제외 대상은 **EXECUTE 회수 2줄뿐**이다.

### 롤백문도 정본을 그대로 복사하면 안 된다

정본 롤백(030:240-241)에는 두 함수에 대한 `grant … to public, anon, authenticated` 가 있다.
**4-2 를 적용하지 않았으므로 되돌릴 것이 없고**, 그대로 복사하면 회수한 적 없는 권한을
새로 부여하게 된다. `apply_030.sql` 하단 롤백문에서 그 2줄을 뺐다.

### 적용 시점

2026년 11월 신규 중개사 승인 플로우 검증 때 034 를 적용한다. 그 흐름에서 어차피 계정을
만들게 되므로 T16-a 가 추가 비용 없이 소화되고, **49번의 R7 도 같은 계정으로 함께 판정**된다.

# extra_note 300자 제한 (2026-08-11 구현·배포) — 032 전제 ② 충족

`migration_032` 가 걸 `requests_extra_note_length` CHECK 보다 **프론트 제한을 먼저 배포**했다.
032 는 여전히 미적용이다.

## 구현 범위

| # | 내용 | 파일 |
| --- | --- | --- |
| 1 | 길이 규칙 단일 정의 지점 신설 | `RequestWizard/validateExtraNote.js` (신규) |
| 2 | `maxLength={300}` + 실시간 카운터 + 초과 표시 | `RequestWizard/steps/ExtraStep.jsx` |
| 3 | 단계 게이트 (extra 단계 "다음" 차단) | `RequestWizard/steps.js` |
| 4 | 제출 게이트 (review → 제출 차단) | `RequestWizard/validateRequest.js` |
| 5 | 카운터·초과 문구 ko/ja/zh/en | `RequestWizard/translations.js` |
| 6 | 카운터 스타일 | `RequestWizard/RequestWizard.css` |

`validateExtraNote.js` 를 따로 만든 이유는 `validateTransaction.js` 와 같다 — 규칙을
세 곳(입력칸·단계·제출)이 쓰는데 각자 `300` 을 하드코딩하면 한 곳만 고쳤을 때 조용히 어긋난다.

## 판단 3건

**(1) 복원본은 자르지 않는다.** `maxLength` 는 사용자 입력만 막고 state 로 주입된 값은
자르지 않는다. 초과 값이 생기는 경로는 `restoreRequestForm()` 복원본과 이 제한 배포 이전
draft 재개 둘뿐이다. **잘라내지 않고 초과 상태를 보여주고 막는다** — Phase 3 가
`restoreRequestForm` 에서 세운 원칙 그대로다(조용히 정상값으로 바꾸면 사용자는 무엇이
잘못됐는지 영영 모른다). 문구는 "N자를 지워주세요"로 **지울 양을 알려준다.**

**(2) extra 단계에서 "다음"을 막는다 — 전세 대출과 반대로 판단했다.** 대출 여부는
transaction 단계에서 막지 않고 review 로 미뤘는데, 그건 "사용자가 아직 답한 적 없는 빈
항목"이라 그 자리에서 막히면 이유를 알 수 없기 때문이었다. 길이 초과는 다르다 — 초과한
본문과 카운터가 바로 위에 보이고 몇 자를 지울지도 화면에 있다. 통과시키면 textarea 가
없는 review 에서 막혀 되돌아와야 한다.

**(3) 글자 수 세는 기준이 DB 와 다르다 (의도).** Postgres `char_length()` 는 코드포인트를,
JS `String.length` 와 HTML `maxLength` 는 UTF-16 코드유닛을 센다. 이모지는 JS 에서 2 로 잡힌다.

- 방향은 안전하다: **항상 JS 카운트 ≥ DB 카운트**이므로 DB 가 거부할 값을 UI 가
  통과시키는 일은 없다. 반대로 이모지가 많으면 UI 가 먼저 막는다(이모지 151개 = JS 302).
- 코드포인트로 세면 DB 와 정확히 일치하지만, 그러면 카운터(코드포인트)와 입력칸
  `maxLength`(코드유닛)가 다른 기준이 되어 **"카운터는 280인데 더 입력이 안 되는"** 상태가
  생긴다. 그쪽이 훨씬 혼란스럽다.
- → 카운터와 입력 제한이 같은 기준을 쓰는 쪽을 택했다. 프론트가 DB 보다 엄격한 것은
  40번 ★(LocationStep station 필수화)과 같은 방향이다.

## ★ 032 적용 직후 실측 항목 — `classifySubmitFailure` 화이트리스트

`src/api/classifySubmitFailure.js` 의 `EDITABLE_CONSTRAINTS` 에
**`requests_extra_note_length` 를 아직 추가하지 않았다.**

- 성격상 editable 이 맞다(사용자가 스스로 고칠 수 있는 값). 그러나 이 파일의 분류는
  **실측으로만 확정한다**는 것이 2026-08-04 에 세운 원칙이다. 032 가 미적용이라 이
  constraint 가 실제로 `code '23514'` 로 오는지, `message` 가 기존 정규식
  (`violates check constraint "이름"`)과 같은 형태인지 확인된 바 없다.
- **추정으로 넣지 않는다.** 미확인 상태로 등록하면 "editable 로 분류된다"고 믿게 되는데
  실제로는 매치 실패로 unknown 에 떨어지면서 아무도 눈치채지 못한다. 등록하지 않은 지금은
  unknown 폴백이 그대로 동작하고, 그것이 안전한 방향이다.
- **→ 032 적용 직후 위반을 1회 재현해 `error.code` / `error.message` 원문을 확인하고,
  기존 2개와 같은 형태이면 Set 에 이름 한 줄을 추가한다.**
- 그때까지 사용자가 이 CHECK 에 걸릴 일은 없다 — 위 게이트 3중이 먼저 막는다.
  화이트리스트는 그 게이트를 우회하는 경로(구버전 클라이언트가 만든 pending payload 재생)를
  위한 **2차 방어**다.

## 검증 결과 (2026-08-11)

**로직 (node 일회성, 저장소에 남기지 않음) — 10케이스 전부 통과**

빈 문자열 / null / undefined → len 0, over 0 · 299자 → over 0 · **300자(경계) → over 0** ·
301자 → over 1 · 412자 → over 112 · 한글 300자 → over 0 · 한글 305자 → over 5.
이모지 경계도 확인: 150개 = JS 300 / 코드포인트 150, 151개 = over 2
(DB `char_length` 기준으로는 통과할 값을 UI 가 먼저 막는다 — 위 판단 (3) 대로 의도된 동작).

**빌드/린트** — `vite build` 성공, `oxlint` 신규 경고 0건(기존 7건은 이번에 만진 파일과 무관).

**브라우저 실사용 — ★ 복원본 경로 통과**

| 항목 | 결과 |
| --- | --- |
| **복원본 412자** | ✅ **잘리지 않고 412자 그대로 유지** |
| 초과 표시 | ✅ 카운터 `412 / 300` 빨강, 입력칸 테두리 빨강 |
| 경고 문구 | ✅ `112자를 지워주세요. 추가 요청사항은 300자까지 쓸 수 있어요.` |
| 단계 게이트 | ✅ "다음" 비활성 |
| 정상화 | ✅ 300자로 줄이니 카운터 회색 복귀 · 경고 소멸 · "다음" 활성 |
| 경계 | ✅ 정확히 300자에서 통과 |
| **양방향 전환** | ✅ 412자로 되돌리니 게이트 다시 걸림 |
| 평상시 카운터 | ✅ `4 / 300` 회색 표시 |
| 정리 | ✅ `roomting_request_draft` 삭제, 요청서 미생성(제출 안 함) |

★ **복원본이 잘리지 않은 것이 이 검증의 핵심이다.** 잘렸다면 사용자는 무엇을 잃었는지
모른 채 제출하게 된다 — 판단 (1)이 막으려던 바로 그 동작이다.

## ⚠️ 미검증 — 초과 경고 문구의 ja/zh/en 렌더

**4개 언어 실렌더는 하지 않았다.** 요청서 작성 도중 언어 전환 진입이 어려웠다.

★ **"다른 화면에서 자연스럽게 드러난다"는 이 항목의 절반에만 맞다.** 둘을 나눠야 한다:

| 요소 | 자연 노출 여부 |
| --- | --- |
| 카운터 `N / 300` | ✅ 언어 무관 문자열(`${current} / ${max}`)이고 5단계에 **항상** 보인다. 어느 언어로 쓰든 곧 드러난다 |
| **초과 경고 문구** | ❌ **드러나지 않는다.** 이 문구는 `overBy > 0` 일 때만 렌더되고, 초과는 **복원본·구버전 draft 재개에서만** 발생한다. 일반 사용자는 평생 볼 일이 없는 경로다 |

즉 경고 문구의 ja/zh/en 은 **누군가 의도적으로 그 상태를 만들지 않으면 영영 확인되지 않는다.**
위험도 자체는 낮다(빌드 통과 = 문법 오류 없음, 4개 언어 키 존재는 grep 으로 확인).
실질 위험은 **375px 에서의 줄바꿈·넘침** 하나이며, en 문구가 가장 길다.

확인이 필요해지면 절차는 위 「검증 결과」의 복원본 주입과 동일하고, 초과 상태를 유지한 채
언어만 전환하면 된다. 기존 「다국어(i18n) 검증 미완료 항목」 섹션과 같은 성격의 이월이다.

## 이번 범위에서 뺀 것

- **`detectContactInfo.js` 연락처 패턴 경고** — 032:78-88 이 설계까지 적어둔 항목
  (휴대폰/유선/이메일/카카오/LINE/WeChat). **차단이 아니라 경고**이고 032 의 CHECK 와
  무관해서 전제 ② 에 포함되지 않는다. **Later 로 분리** (2026-08-11 결정).
  안내 문구("연락처는 채팅에서 안전하게 주고받을 수 있어요")도 같은 묶음이다.
  ★ 5번 항목이 이미 적었듯 **300자 제한은 경감 조치이지 개인정보 보호의 해결이 아니다.**
  이번 구현으로 "보호 완료"가 되지 않았다.
- **`jeonse_loan_detail` 카운터** — 같은 자유 입력 필드인데 현재 길이 제한이 전혀 없다.
  032 도 이 컬럼에는 CHECK 를 걸지 않는다. 제안 단계로만 기록한다.

# 031 백업 설계 · preflight 실측 (2026-08-11) — 설계 확정, 백업 미실행

031 은 **적용하지 않았고 백업도 뜨지 않았다.** 이 섹션은 설계와 read-only 실측 기록이다.

## 031 실행문은 **5개**다

| # | 줄 | 실행문 |
| --- | --- | --- |
| 1 | 91 | `alter table properties drop constraint if exists properties_request_realtor_unique;` |
| 2 | 102 | `drop policy if exists "properties_insert_realtor" on properties;` |
| 3 | 104-124 | `create policy "properties_insert_realtor" …` (030 조건 + `realtor_response_count() < 5`) |
| 4 | 154-170 | `create or replace function public.increment_response_count()` (`+1` → `count(distinct realtor_id)`) |
| 5 | **172** | `revoke all on function public.increment_response_count() from public, anon, authenticated;` |

★ 정책 DROP+CREATE 를 **한 작업**으로 설명하더라도 **statement 개수는 5로 센다.**
정본과 대조할 때 숫자가 어긋나면 재조사 비용이 생긴다.

**data migration 은 0건이다.** 백필(176-196행)은 전부 주석이고 실행되는
`UPDATE`/`DELETE`/`INSERT` 가 없다. 인덱스 변경도 없다.

## preflight 실측 (2026-08-11, read-only, DB write 0건)

| Q | 항목 | 결과 |
| --- | --- | --- |
| Q1 | 권한·소유자·RLS | `is_superuser=false` / 대상 테이블 `owner=postgres` / `rls_forced=false` |
| Q2 | 트리거 전수(public) | **4행.** 백업 대상 5개 중 트리거는 `properties` 의 `trg_increment_response_count`(AFTER INSERT, `tgenabled='O'`) **1개뿐**. `property_images`·`favorites`·`chat_rooms`·`chat_messages` = **0** |
| Q3 | incoming FK | **4행 전부 ON DELETE CASCADE.** `properties` ← `property_images`/`favorites`/`chat_rooms`, `chat_rooms` ← `chat_messages` |
| Q4 | 행 수 | properties **2** / property_images **4** / **favorites 1** / chat_rooms **2** / chat_messages **3** / requests **10** |
| Q5 | property 별 팬아웃 | `4c51fb17…`(공개, `request_id` NULL): img4 fav1 room1 msg1 · `c8ab5299…`(`dz`, 신촌 응답): img0 fav0 room1 msg2 — 합계가 Q4 와 일치 |
| Q6 | 중복 그룹 (P5) | **0 / (none)** |
| **Q7** | **`response_count` 정합성 (HARD GATE)** | **`total_mismatches` 0.** 10행 전부 정합. `cc193972…` 만 counter 1 / rows 1 / distinct 1, 나머지 9건 0 |
| Q8 | 031 전제 상태 (P6) | **5/5 OK** |

★ **Q7 이 이 묶음의 게이트였다.** 031 전이므로 트리거가 `+1` 증분식이고
`response_count == actual_property_rows` 가 성립해야 정상이다. 불일치가 있었다면 백업보다
원인 조사가 먼저였다 — 잘못된 카운터를 백업해 두고 나중에 "원본"이라며 복구하면 그 값이
사실로 굳는다. `response_count` 는 파생값이라 `properties` 에서 언제든 재계산할 수 있으므로
불일치는 **복구 대상이 아니라 조사 대상**이다.

## 백업 대상 — 폐쇄 집합 5개 (실측 확정)

```
properties · property_images · favorites · chat_rooms · chat_messages
```

`favorites` 추가 근거는 위 4번 항목 참고. Q3 의 FK 전수와 Q4 의 1행 실측으로 확정됐다.

### `requests` 는 **snapshot-only / not restore target**

★ **`requests` 는 복원 시 DELETE/INSERT 대상이 아니다.** 031 은 `requests` 행을 만들거나
지우지 않고, 복원 절차도 `requests` 행을 건드리지 않는다. 전체 행 복원 대상으로 오해하지 말 것.

스냅샷에 담는 것은 **4개 컬럼**이다:

| 컬럼 | 용도 |
| --- | --- |
| `id` | 카운터 원복 대상 식별 |
| `response_count` | 복원 후 대조·원복 |
| `status` | 나중에 사람이 어느 요청서인지 식별 (감사) |
| `created_at` | 동일 (감사) |

`status`/`created_at` 은 복구에 불필요하지만 비용이 거의 0이고, 없으면 나중에 스냅샷을 보고
어느 요청서인지 알 수 없어 감사가 되지 않는다.

## 트리거 전략 — 끄지 않는다 (실측 근거 추가)

**결론 유지**: `DISABLE TRIGGER` 도 `session_replication_role` 도 쓰지 않는다.
복원 후 `response_count` 를 스냅샷 값과 대조해 원복한다.

- **Q1 실측으로 `session_replication_role` 이 실제로 불가함이 확인됐다** — `is_superuser=false`.
  이 설정은 superuser 권한을 요구한다. 추정이 아니라 확정이다.
- `ALTER TABLE ... DISABLE TRIGGER` 는 `owner=postgres = current_user` 라 **가능하지만 쓰지 않는다.**
  끄고 다시 켜야 하는데 복원 중 오류로 중단되면 꺼진 채 남고, 그 상태에서 정상 응답이 들어오면
  카운터가 조용히 안 오른다 — 발견이 가장 어려운 종류의 고장이다.
- `response_count` 는 **파생값**이다. 원본이 아닌 값을 지키려고 특권 조작을 할 이유가 없다.

★ **이번 작업에서 트리거 상태 변경은 0건이다.**

### 복원 시 카운터 거동이 트리거 버전에 따라 갈린다

| 시점 | 트리거 본문 | 복원 INSERT 의 효과 |
| --- | --- | --- |
| 031 **전**(현재) | `response_count + 1` | **증분** — 재INSERT 마다 누적, 행 수만큼 부풀어 오른다 |
| 031 **후** | `count(distinct realtor_id)` | **파생** — 매번 재계산, 복원이 끝나면 자동 수렴 |

→ 데이터 복원을 **트리거 롤백보다 먼저** 한다. 순서가 바뀌면 마지막에 스냅샷 값으로 덮어쓴다.

## RLS — SQL Editor 는 우회한다 (실측 확정)

Q1 에서 `rls_forced=false` + `owner=postgres` 를 확인했다. 즉 **SQL Editor 의 DELETE 에는
RLS 방어가 없다.** 앱에는 `properties` DELETE 정책이 아예 없어(031:130) 아무도 못 지우지만
SQL Editor 에는 그 방어가 존재하지 않는다.

★ **복원 SQL 의 모든 DELETE 에 id 명시 열거 가드를 넣는다.** `where` 없는 DELETE 를 쓰지 않고,
`where request_id = …` 같은 조건식도 쓰지 않는다(백업에 없는 행이 범위에 들어올 수 있다).

## 복원 순서

```
DELETE (자식 → 부모)   chat_messages → chat_rooms → favorites → property_images → properties
INSERT (부모 → 자식)   properties → property_images → favorites → chat_rooms → chat_messages
이후                   중복 0 확인 → unique 재생성 → 정책 롤백 → 트리거 롤백 → 카운터 원복
```

PK 는 5개 테이블 전부 `uuid` + `gen_random_uuid()` 이고 **sequence 가 없어 재조정이 불필요**하다.
id 를 원본 그대로 넣으면 FK 관계가 그대로 살아난다. `created_at` 은 default `now()` 가 있으므로
**명시하지 않으면 복원 시각으로 덮인다** — JSON 에 포함해 넣는다.

## Storage 백업 불필요

`property_images.image_url` 은 `getPublicUrl()` 결과 문자열이다. 031 에 storage 문이 0건이고,
Postgres FK cascade 는 `storage.objects` 에 도달할 수 없으며, 앱에 `.remove(` 호출이 0건이다
(`src/` 전수 확인). → **DB 행만 복원하면 이미지가 돌아온다.** 스토리지 객체는 고아가 될 뿐
사라지지 않는다.

## 백업 방식 — `jsonb_agg` 단일 문장

CSV 는 **null 과 빈 문자열을 구분하지 못해** 기각했다(`properties.address`/`description`,
`chat_rooms.*_last_read_at` 이 전부 nullable). 5개 테이블 + `requests` 스냅샷을 **한 문장**으로
떠서 statement-level consistency 로 정합성을 확보한다 — 락도 서비스 중단도 필요 없다.

★ 실사용자가 생기면 SQL Editor 결과 크기·복사 한계로 이 방식이 깨진다. 그 시점에는
CLI dump 또는 Pro 플랜 PITR 로 전환해야 한다. **백업 전략 재검토 시점 = 실사용자 확보 직전.**

## 031 READY 게이트

| # | 항목 | 상태 |
| --- | --- | --- |
| **P1** | 백업 대상 확정 (폐쇄 집합 5 + `requests` 카운터 스냅샷) | ✅ Q3/Q4 실측 |
| **P2** | 실제 백업 완료 | ❌ **미실행** |
| **P3** | manifest 작성 (행 수 대조 가능) | ❌ **미작성** |
| **P4** | 복원 절차 검증 (`begin`/`rollback` 리허설) | ❌ **미실행** |
| **P5** | 중복 0건 | ✅ Q6 = 0 |
| **P6** | 031 원문과 DB 상태 일치 | ✅ Q8 = 5/5 |
| **P7** | rollback 경계 문서화 (lossless 경계) | ✅ 위 4번 항목 |
| **P8** | 031 ↔ 034 권한 중복 정리 | ✅ 2026-08-11 (아래) |

**→ 031 READY 아님. 남은 blocker: P2 / P3 / P4.**

## ★ P8 — 031:172 가 034 의 일부를 선행 실행한다

```
migration_030 4-2 (2026-08-11 에 제외한 2줄):
  revoke all on function public.handle_new_user()          from public, anon, authenticated;
  revoke all on function public.increment_response_count() from public, anon, authenticated;  ← 이것

migration_031:172:
  revoke all on function public.increment_response_count() from public, anon, authenticated;  ← 같은 것
```

- **031 을 적용하면 034 가 하려던 일의 절반이 그때 실행된다.** 50번에서 T16 검증 비용 때문에
  미뤄둔 바로 그 회수다.
- **034 에서 재실행되어도 무해하다** — `REVOKE` 는 idempotent 다. 다만 "왜 034 적용 전에 이미
  회수돼 있지?" 라는 혼동을 막기 위해 034 에 기록했다.
- **T16-b 는 031 의 C1/C3 에 흡수된다.** C1(매물 1→5개 순차 제출)과 C3(`response_count` 갱신)이
  정확히 "권한 회수 후에도 트리거가 도는가"를 확인한다. **031 적용 후 C1/C3 가 PASS 면
  `increment_response_count` 쪽 T16-b 는 완료**로 본다.
- **034 에 남는 실질 신규 작업은 `handle_new_user()` revoke 하나**다.

★ **034 의 revoke SQL 문장 자체는 지우지 않았다.** 031 이 선행해 no-op 이 되더라도 문장을
제거하면 "034 가 원래 무엇을 하려던 것인지" 추적이 어려워진다. 남겨 두고 상태를 주석으로
기록하는 쪽이 provenance 가 깔끔하다.

## 다음 단계 (전부 승인 대상)

1. **P2** — 백업 단일 쿼리 1회 실행 → `backup.json` 저장 (저장소 **밖**)
2. **P3** — manifest 작성 (행 수 / 커밋 해시 / migration 상태 / 복원 순서 / 검증 기준)
3. **P4** — `begin`/`rollback` 복원 리허설. ★ **DB write 포함**(롤백됨). 별도 승인 필요.
   이 저장소에 선례가 있다 — migration_020/021 검증을 같은 방식으로 했다(위 「RequestWizard
   단계형 전환」 항목)
4. P2~P4 전부 PASS → **031 READY 선언**

★ P4 를 건너뛰면 "백업 파일은 있는데 복원되는지는 모르는" 상태다. 031 백업 설계의 목적은
파일 확보가 아니라 **복원 가능성 확보**다.
