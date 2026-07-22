# 룸팅 (Roomting)

한국 내 외국인 거주자(워킹홀리데이, 유학생 등)를 초기 타겟으로 한 역매칭 부동산 플랫폼 MVP.
고객이 조건(지역, 예산, 방 타입 등)을 입력하면 공인중개사가 매물로 응답하는 방식.

## 기술 스택

- **프론트엔드**: React + Vite (추후 Capacitor로 감싸 iOS/Android 앱스토어 출시 예정)
- **백엔드 / DB / 인증**: Supabase
- **웹 배포**: Vercel
- **코드 관리**: GitHub

## 계정 유형

| role | 설명 |
|---|---|
| customer | 고객 - 조건 요청서를 작성하고 매물 응답을 받음 |
| realtor | 공인중개사 - 조건에 맞는 매물로 응답 |
| care_agent | 에이전트 - 계약 동행 케어 패키지 담당, 고객을 대신해 조건 요청서 작성 가능 |
| admin | 관리자 - 내부 운영용 (MVP 단계는 Supabase 대시보드로 직접 관리) |

## 폴더 구조

```
src/
  api/         Supabase와 통신하는 함수 모음.
               화면(UI)과 완전히 분리되어 있어, 나중에 프론트엔드를 완전 네이티브(Swift/Kotlin, React Native)로
               바꾸더라도 이 폴더의 로직은 그대로 재사용 가능하도록 설계함.
  pages/       화면 단위 폴더 (회원가입, 조건입력, 지도탐색, 채팅 등) - 화면 만들면서 추가 예정
  components/  여러 화면에서 재사용하는 작은 UI 조각 - 화면 만들면서 추가 예정
supabase/
  schema.sql   테이블 / enum 타입 / 트리거 정의 SQL
  policies.sql RLS(Row Level Security, 데이터 접근 권한) 정책 SQL
```

## 로컬 실행 방법

1. 의존성 설치
   ```
   npm install
   ```
2. 프로젝트 루트에 `.env` 파일 생성 (`.env.example`을 복사해서 이름만 `.env`로 변경)
   - Supabase 대시보드 > 해당 프로젝트 > Project Settings > API 메뉴에서
     `Project URL` → `VITE_SUPABASE_URL`, `anon public` 키 → `VITE_SUPABASE_ANON_KEY`에 붙여넣기
3. 개발 서버 실행
   ```
   npm run dev
   ```
4. 터미널에 뜨는 주소(보통 `http://localhost:5173`)를 브라우저로 접속

## Supabase 설정 (처음 한 번만)

1. `supabase/schema.sql` 내용을 Supabase 대시보드 SQL Editor에 붙여넣고 실행 → 테이블 생성
2. `supabase/policies.sql` 내용을 이어서 실행 → 데이터 접근 권한(RLS) 설정
3. 소셜 로그인(카카오, 라인, Google) 설정은 별도 단계에서 진행 (Authentication > Providers 메뉴)

## 주의사항

- `.env` 파일은 절대 GitHub에 올리지 않습니다 (`.gitignore`에 등록되어 있음). API 키가 필요하면 각자 Supabase 대시보드에서 발급받아 `.env`에 넣습니다.
- 결제/과금 기능은 MVP에 포함되어 있지 않습니다. `requests.response_count`는 표시용 응답 개수 카운트일 뿐, 실제 과금 로직은 없습니다.
- `care_packages` 테이블은 향후 에이전트 케어 패키지 매칭 기능을 위한 뼈대만 만들어둔 상태이며, 실제 신청/매칭 기능은 아직 구현되지 않았습니다.

## 진행 상황 (다음 세션 시작 시 참고)

- [x] Supabase 프로젝트 생성
- [x] 테이블 8개 생성 (profiles, requests, properties, property_images, favorites, chat_rooms, chat_messages, care_packages)
- [x] RLS 정책 설정
- [x] Supabase 클라이언트 연결 코드 (`src/api/supabaseClient.js`, `src/api/auth.api.js`)
- [ ] `.env` 로컬 설정 및 실행 확인
- [ ] 프로토타입 9개 화면 파일 전달받아 실제 화면 구현 시작
- [ ] 회원가입/로그인 (소셜 로그인 포함) 화면 구현
- [ ] 조건 요청서 작성 화면 (고객 / 에이전트 대리 작성)
- [ ] 공인중개사 요청 목록 확인 및 매물 응답 화면
- [ ] 받은 응답 목록 화면
- [ ] 채팅 + 자동번역
- [ ] GitHub 저장소 연결, Vercel 배포
- [ ] Capacitor로 iOS/Android 빌드
