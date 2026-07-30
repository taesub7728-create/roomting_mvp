-- 마이그레이션 019: Phase 3 Map 공개화 - get_public_listings()에 anon 실행 권한 추가
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_018_block_pending_applicant_requests.sql까지 먼저 실행되어 있어야 함
--
-- 배경: 비로그인 방문자도 /map에서 공개 매물을 열람할 수 있게 한다 (문의/채팅/상세보기 등
-- 행동은 그대로 로그인 필요). get_public_listings()는 migration_011에서 이미 개인정보/원본
-- 좌표/정확주소를 제외하고 반환하도록 설계되어 있으므로, 이 함수의 실행 권한만 anon에 추가한다.
--
-- 영향 범위:
--   변경 대상: get_public_listings() 함수 권한(GRANT)만
--   영향 받는 기능: /map 공개 매물 조회 - anon도 authenticated와 동일한 결과를 받게 됨
--   영향 없음: RLS 정책(변경 없음), properties/property_images 테이블 권한(변경 없음),
--              다른 함수(check_landline_duplicate 등, 변경 없음), authenticated 권한(그대로 유지)
--
-- rollback: revoke execute on function public.get_public_listings() from anon;

grant execute on function public.get_public_listings() to anon;
