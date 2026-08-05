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
- 위 두 가지는 **소셜 로그인 키 연동 작업 때 함께 묶어서** 검증하는 것이 효율적이다.
  그 전까지는 미검증으로 남긴다.
- `invalid` / `expired` 상태 화면은 실제 렌더 미확인(로직은 node 스크립트로 검증).
- 4개 언어 렌더는 마법사 쪽만 확인했고 SignUp의 pending 상태 문구는 ko만 확인했다.

**기존 이월 항목 (여전히 미검증)**
- Chat.jsx / ProfileMissingError.jsx 4개 언어 렌더(위 "다국어 검증 미완료" 섹션)
- open 요청서 직행 실계정 검증(위 "Splash/Onboarding" 섹션)

**테스트 계정 정리 — Phase 4 착수 전 필수 (2026-08-05 갱신)**
- Phase 1~3 브라우저 실사용 테스트용으로 Supabase 대시보드에서 직접 만든 customer
  테스트 계정 1개(2026-08-04 생성)가 살아 있다. 이 저장소는 public이므로 계정
  식별 정보와 자격증명 특성은 여기 적지 않는다 — Supabase 대시보드에서 확인한다.
- **이 계정의 비밀번호는 매우 약하다(대시보드에서 직접 확인할 것).** 실제 서비스
  데이터에 접근 가능한 계정이므로 방치하면 그대로 위험이다.
- **Phase 4 착수 전에 반드시 삭제하거나 비밀번호를 변경한다.** Phase 3 검증은 끝났지만
  `finishAfterAuth`(신규 가입/finalizeMode) 경로가 미검증으로 남아 재사용 가능성이 있어
  지금 당장 삭제하지 않고 유지 중이다. 그 검증이 끝나거나 Phase 4가 시작되면 즉시 정리한다.
- 검증 과정에서 생성한 `requests` 행 1건(`region_text='phase3-verify'`)도 함께 정리 대상이다.
- 자격증명을 적어둔 로컬 메모 파일은 2026-08-05에 삭제했다. 그 파일은 스스로
  "`*.local` 패턴으로 gitignore 처리됨"이라고 적고 있었지만 실제로는 무시되지 않는
  상태였다(`*.local`은 `.local`로 끝나는 파일만 매치). 커밋된 이력이 없음을
  `git log --all`로 확인했고, 재발 방지를 위해 `.gitignore`에 `*.local.*` 패턴을
  추가했다.
- 앞으로 자격증명을 파일로 남길 때는 주석을 믿지 말고 `git check-ignore -v <파일>`로
  실제 무시 여부를 확인한다. 저장소가 public이라는 점도 함께 고려한다.

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

Phase 1~3 구현은 끝났다. 남은 일은 위 "브라우저 실사용 테스트 전체 미실시" 항목의
실제 검증과, 그 결과에 따른 수정이다. 테스트 계정 정리(위 섹션)도 검증 완료 즉시 처리한다.

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
