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

## 향후 권한 모델 발전 방향

지금까지 검증된 원칙: role 하나만으로 권한을 판단하지 않는다.

현재는 profiles.role + realtor_applications 존재 여부 조합으로 판단하고 있음.

서비스가 확장되면 아래 방향으로 발전 필요:

- role + application 상태 + account 상태(active/suspended 등)를 종합 판단
- 향후 중개사 정지, 광고 권한, 유료 회원, 에이전트 권한, 세분화된 관리자 권한 추가 시 기반 구조로 활용
- 장기적으로 canCreateRequest(), canReceiveRequests() 같은 공통 권한 판단 함수 레이어로 발전 고려
