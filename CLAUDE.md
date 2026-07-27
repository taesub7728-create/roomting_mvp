# ROOMTING Development Rules

## 1. 기본 원칙
새 기능 추가 또는 기존 기능 수정 시 다음 순서를 따른다:
분석 → 승인 → 구현 → 검증
판단이 애매하면 안전한 방향(분석 후 승인)으로 진행한다.

## 2. 분석 후 승인이 필수인 작업
다음 중 하나라도 해당하면 코드 작성 전에 반드시 분석 내용을 먼저 보고하고 승인을 받는다:
- DB 스키마 변경 / migration 생성
- RLS 정책 신규 작성 또는 수정
- role/권한 체계 관련 변경
- Auth(인증) 흐름 변경
- 개인정보 저장/조회/삭제 관련 기능
- Storage 권한 변경
- 결제 또는 외부 API 신규 연동

### 분석 항목 (7가지)
1. 현재 DB 영향 2. 기존 기능 영향 3. RLS 영향 4. 개인정보 영향 5. 권한 상승 가능성 6. migration 필요 여부 7. rollback 방법

### 영향 범위 표시 (분석 시 반드시 이 형식 포함)
변경 대상: 파일 / DB / API / 사용자 흐름
영향 받는 기능: 기능명 / 영향 내용
영향 없음: 확인한 영역 / 판단 근거

## 3. 작업 전 필수 확인
분석이 필요한 작업은 코드/설계를 새로 만들기 전에 반드시 관련 기존 자원을 먼저 확인한다:
관련 frontend 파일 / API·service 파일 / DB migration 파일 / RLS policy / trigger·function / 기존 사용 흐름
기존 구조를 확인하지 않고 새로운 구조(새 테이블, 새 함수 등)를 임의로 설계하지 않는다. 이미 비슷한 기능/테이블이 있는지 먼저 찾는다. (예: realtor_applications, profiles, requests, properties가 이미 있는데 broker_requests, agents, new_profiles 같은 유사 테이블을 새로 만들지 않는다.)

## 4. Migration 규칙
기존 migration 파일은 절대 수정하지 않는다.
DB 변경이 필요한 경우 반드시: 새 migration 파일 생성 → 영향 분석 → rollback 방법 작성 → 승인 → 적용
migration 순서를 깨뜨리는 수정은 금지한다.

## 5. 보안 변경 규칙
인증, 권한, RLS, Storage, 개인정보 관련 변경은 코드 작성 전에 반드시 아래를 먼저 작성한다:
1. 공격 가능 시나리오 2. 정상 사용자 흐름 3. 차단되어야 하는 요청 4. 허용되어야 하는 요청 5. 테스트 방법
테스트 계획 없는 보안 관련 코드는 작성하지 않는다.

## 6. Supabase 데이터 접근 규칙
프론트엔드에서 직접 권한 판단 로직을 만들어 그것을 보안 장치로 삼지 않는다.
금지: frontend에서 role==='admin' 판단 후 화면/기능 노출을 "보안 조치"로 간주하는 것, client-side 조건만으로 데이터 보호, UI 숨김 처리만으로 권한 보호했다고 판단하는 것.
이런 코드는 UX 편의를 위한 것일 뿐 보안이 아니다. 실제 권한 판단은 반드시 Supabase RLS, Database Function(SECURITY DEFINER), 또는 서버 측 validation 중 하나에서 이루어져야 하며, 새 화면/기능을 만들 때 이 중 어디서 실제로 방어되는지 명시한다.

## 7. 개인정보 저장 규칙
새로운 개인정보 필드를 추가하기 전 반드시 보고한다.
검토 항목: 왜 필요한 데이터인지 / 저장 기간 / 누가 조회 가능한지 / 삭제 방법 / 적용될 RLS 정책
민감 가능 데이터 예: 연락처, 이메일, 신분증, 사업자등록증, 비자 관련 정보, 계약 관련 자료

## 8. 검증 규칙
구현 완료 후 반드시 아래를 보고한다: 변경 내용 요약 / 테스트 방법 / 테스트 결과 / 실패한 항목 / 남은 위험 요소
보안 관련 변경은 정상 흐름과 공격 흐름 모두 테스트한다. (예: "정상: admin→승인→realtor 변경 PASS", "공격: customer→role admin 변경 시도 FAIL(차단됨)")
"빌드 성공"만으로 검증 완료라고 보고하지 않는다.

## 9. MVP 범위 규칙
새 기능을 제안하거나 확장할 때 반드시 아래로 구분해서 제시한다:
- 현재 MVP 필수 (출시 전 필요)
- Later (출시 후 개선)
- 제안만 (아이디어 단계)
기존 핵심 흐름(회원가입/매칭/승인 등)을 깨는 기능 확장은 승인 없이 진행하지 않는다.

## 10. 분석 없이 바로 진행(auto) 가능한 작업
- UI/스타일/문구 변경
- 기존 테이블/RLS 구조를 그대로 사용하는 화면 추가
- 버그 수정, 리팩토링, dead code 제거
- 이미 존재하는 API를 호출만 하는 프론트 기능

## 11. 실행 권한 제한
아래 작업은 사용자 승인 없이 절대 실행하지 않는다. 항상 먼저 변경안(SQL/코드)을 출력하고 승인을 받은 뒤에만 실행한다:
Supabase migration 적용 / SQL 실행 / DB 데이터 수정 / 테스트 계정 생성 / Storage 파일 삭제 / 환경변수 변경

## 12. Git 규칙
큰 변경을 시작하기 전에 현재 상태를 확인한다: git status로 변경 파일 확인 / 아직 커밋되지 않은 기존 작업이 있는지 확인
커밋하기 전에는 반드시 변경 내용 요약 / 영향 범위 / 테스트 결과를 보고한다.
사용자 승인 없이 다음을 수행하지 않는다: git reset --hard / 커밋되지 않은 변경사항 checkout으로 되돌리기 / 강제 push / 커밋·브랜치 삭제

## Phase 2 Role 정리 참고

pending_realtor는 현재 호환성을 위해 유지하지만 신규 사용하지 않는다.
추후 실제 DB 사용 여부 확인 후 제거 여부를 결정한다.
자세한 내용은 TODO_PHASE2.md 참고.

## Architecture Separation Rule

현재 MVP 단계에서는 하나의 React 프로젝트로 배포하지만, 장기적으로 customer/realtor/admin을
완전히 분리된 서브도메인(예: roomting.com / agent.roomting.com / admin.roomting.com)으로
운영하는 것을 목표로 한다.

폴더 구조:
src/apps/customer  - 고객 전용 페이지/컴포넌트/라우트
src/apps/realtor   - 공인중개사 전용 페이지/컴포넌트/라우트
src/apps/admin     - 관리자 전용 페이지/컴포넌트/라우트
src/shared         - 공용 인프라 영역
api/customer, api/realtor, api/admin - 영역별 API 레이어

shared 포함 가능: Supabase client, Auth provider/context, 공통 hooks, 타입 정의, 순수 utility 함수,
여러 영역에서 실제로 공유되는 UI 컴포넌트
shared 포함 금지: customer 전용 비즈니스 로직, realtor 전용 비즈니스 로직, admin 전용 운영 로직

라우트 구조:
/login, /realtor/login, /admin/login 으로 로그인 진입점을 분리한다.
각 영역은 각자의 Route Guard를 가진다: CustomerRoute, RealtorRoute, AdminRoute

의존성 방향 원칙:
apps/customer → shared, apps/realtor → shared, apps/admin → shared 방향만 허용한다.
customer → realtor, customer → admin, realtor → admin, admin → customer/realtor
방향의 의존성은 금지한다.

원칙:
- customer 영역 코드는 realtor/admin 영역 코드를 직접 import하지 않는다 (반대도 마찬가지).
- 새 기능은 반드시 이 구조를 따라 해당 영역 폴더 안에 만든다.
- Frontend Route Guard(화면 접근 제어, UX 목적)와 Supabase RLS(실제 데이터 보호, 보안 목적)를
  동일한 보안 계층으로 취급하지 않는다. 실제 데이터 보호는 항상 RLS가 최종 책임을 진다.

## API Boundary Rule

각 app 영역은 자신의 api layer만 직접 호출한다.
- customer 영역 코드 → api/customer만 호출
- realtor 영역 코드 → api/realtor만 호출
- admin 영역 코드 → api/admin만 호출

shared/api는 인증, 공통 데이터 조회(예: 본인 프로필 조회) 등 정말 여러 영역에서
공통으로 쓰이는 것만 담당한다.

다른 영역의 API를 직접 호출하지 않는다 (반대 방향도 모두 금지).
새 기능을 만들 때 다른 영역의 API가 필요해 보인다면, 그건 설계 자체를 다시 검토해야 한다는
신호다 — 바로 import해서 쓰지 말고 먼저 보고한다.

## 로그인 페이지 profile null 처리 (추후)

현재 4개 로그인 페이지(LoginChoice, SignUp login모드, RealtorSignUp login모드, AdminLogin)는 
"user는 있는데 profile이 없는" 비정상 상태를 별도로 처리하지 않고 로그인 폼을 그대로 보여준다.

Route Guard(RealtorRoute/CustomerRoute/AdminRoute)는 이 경우 ProfileMissingError를 보여주는데, 
로그인 페이지도 동일하게 처리하는 게 UX상 더 일관적이다.

처리 기준:
- user === null → 로그인 화면 표시
- user 존재 + profile 존재 → role에 맞는 홈으로 리다이렉트
- user 존재 + profile === null → ProfileMissingError 표시

현재는 OAuth 콜백/회원가입 흐름과의 충돌 가능성을 줄이기 위해 의도적으로 보류한다.
Step 1.5(로그인 UX 정리) 진행 시 함께 처리한다.
