-- 마이그레이션 031: 요청서당 매물 최대 5개 응답 + response_count 재정의
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_030_secure_requests_access.sql까지 먼저 실행되어 있어야 함
--
-- ############################################################################
-- ★★ 되돌리기 어려운 단계다. 적용 전에 반드시 백업을 뜬다. ★★
--
--   Supabase Free 플랜에는 자동 백업이 없다(일일 백업은 Pro 이상, PITR은 유료 애드온).
--   롤백하려면 unique 제약을 다시 걸어야 하는데, 이미 한 중개사가 같은 요청에 2개 이상
--   보낸 뒤라면 그 명령이 실패한다. 초과분을 지우면 chat_rooms가 cascade로 사라지고
--   대화 기록까지 소실된다.
--
--   백업 대상 4개 (cascade 연쇄): properties, property_images, chat_rooms, chat_messages
--
--   방법 A (권장, 전체 덤프)
--     npx supabase login
--     npx supabase link --project-ref <프로젝트-ref>
--     npx supabase db dump -f backup_before_030.sql --data-only
--     ※ 결과 파일은 저장소 밖에 둘 것
--
--   방법 B (CLI 없이, SQL Editor에서 4회 실행 후 결과 저장)
--     select jsonb_pretty(coalesce(jsonb_agg(t),'[]'::jsonb)) from (select * from properties)      t;
--     select jsonb_pretty(coalesce(jsonb_agg(t),'[]'::jsonb)) from (select * from property_images) t;
--     select jsonb_pretty(coalesce(jsonb_agg(t),'[]'::jsonb)) from (select * from chat_rooms)      t;
--     select jsonb_pretty(coalesce(jsonb_agg(t),'[]'::jsonb)) from (select * from chat_messages)   t;
-- ############################################################################
--
-- ============================================================================
-- 응답 구조 정책 (확정)
-- ============================================================================
--   - 중개사는 요청서 하나에 매물을 최대 5개까지 제안할 수 있다
--   - 고객 화면은 중개사별로 묶어 보여준다(부동산 카드 접힘 -> 펼치면 매물 1~5개)
--
--   구조는 기존 properties를 그대로 쓴다(B안). responses 테이블을 신설하지 않는 근거:
--     - properties가 이미 request_id + realtor_id를 가진다. "응답 1건"이 정확히
--       "같은 (request, realtor) 조합의 매물들"과 같다
--     - listPropertiesForRequest()가 이미 realtor를 조인해 오므로 조회 API 변경이 없다.
--       프론트 groupBy만 추가하면 된다
--     - responses 신설 시 properties 관련 RLS 정책 4개와 properties_request_or_public
--       CHECK을 전부 다시 써야 한다
--     - 채팅이 매물 단위(chat_rooms.property_id + unique(property_id, customer_id))라
--       responses를 도입해도 채팅은 여전히 매물에 붙는다
--   "응답 단위 메타데이터"가 필요해지면 나중에 responses를 추가하고
--   properties.response_id를 nullable로 붙이면 된다. 지금 만들 이유가 없다.
--
-- ============================================================================
-- 보안 시나리오
-- ============================================================================
-- [1] 공격 시나리오
--   B1 한 중개사가 요청서 하나에 매물 100개 스팸        => realtor_response_count() < 5
--   B2 두 탭 동시 INSERT로 6개                          => ★미방어. 감수하는 위험(아래)
--   B3 영업지역 밖 요청서에 매물 추가                    => 030 조건 유지
--   B4 남의 매물 수정/삭제                               => update는 realtor_id 조건,
--                                                          delete는 정책 자체가 없음
--
-- [2] 정상 흐름: RealtorRespond에서 매물 제출 -> 폼 초기화 -> 최대 5개까지 이어서 추가
--                -> 고객 ResponseStatus에 부동산 카드 하나로 묶여 표시
--
-- [3] 차단: 6번째 INSERT / 영업지역 밖 / 타인 매물 수정 / 매물 삭제
-- [4] 허용: 같은 (request, realtor) 최대 5행 / 본인 매물 수정 / 나중에 이어서 추가
-- [5] 테스트: 파일 하단 C1~C6
--
-- ★ 감수하는 위험 (B2)
--   RLS WITH CHECK는 다른 행을 세는 방식이라 동시 INSERT를 막지 못한다. 두 요청이 각각
--   count=4를 읽으면 6개가 될 수 있다. 피해는 매물 1개 초과에 그치고 admin이 정리
--   가능하며, 중개사가 같은 요청에 동시 제출할 현실적 이유가 없다.
--   Phase 3에서 client_submission_id를 보류하며 감수한 것과 같은 성격의 트레이드오프다.
--   완전 차단이 필요해지면 response_slot 컬럼 + 부분 unique index로 전환한다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: properties 제약 1개 drop, INSERT 정책 재작성, 트리거 함수 재정의, 데이터 백필
--             / API: createPropertyResponse()의 23505 문구 / properties.api.js
--             / 사용자 흐름: 중개사 응답 작성, 고객 응답 확인, 중개사 대시보드 경쟁도 표시
--   영향 받는 기능: RealtorRespond(폼 반복 입력), ResponseStatus(부동산별 그룹핑),
--                  RealtorDashboard(배지 + "N곳 응답" 문구)
--   영향 없음: 채팅(매물별 구조 유지) / 공개 매물(request_id null이라 5개 제한 미적용) /
--             요청서 작성 / 매물 사진


-- ========================================
-- 1. migration_007의 unique 제약 제거
--
--    alter table properties
--      add constraint properties_request_realtor_unique unique (request_id, realtor_id);
--
--    이 제약이 있는 한 중개사는 요청서당 매물을 1개밖에 못 보낸다. 확정된 정책과
--    정면으로 충돌한다. CLAUDE.md 4번에 따라 007 파일은 수정하지 않고 여기서 drop한다.
-- ========================================
alter table properties drop constraint if exists properties_request_realtor_unique;


-- ========================================
-- 2. properties INSERT 정책 재작성 (030 조건 + 5개 제한)
--
--    DB CHECK로는 불가능하다(다른 행을 세야 함). BEFORE INSERT 트리거도 가능하지만
--    이 코드베이스에 "거부"용 트리거 전례가 없고, migration_018이 RLS + SECURITY DEFINER
--    헬퍼 패턴을 이미 쓰고 있으므로 그쪽을 따른다.
--    헬퍼는 029의 realtor_response_count().
-- ========================================
drop policy if exists "properties_insert_realtor" on properties;

create policy "properties_insert_realtor" on properties
  for insert to authenticated
  with check (
    realtor_id = auth.uid()
    and public.current_user_role() = 'realtor'
    and (
      request_id is null                      -- 공개 매물(지도)은 영업지역/개수 무관
      or (
        exists (
          select 1
          from public.requests r
          join public.realtor_service_areas sa
            on sa.district_code = r.district_code
          where r.id = properties.request_id
            and sa.realtor_id = auth.uid()
            and sa.area_type  = 'district'
        )
        and public.realtor_response_count(properties.request_id) < 5
      )
    )
  );


-- ========================================
-- 3. 삭제 정책은 만들지 않는다 (현 상태 유지)
--
--    properties에는 DELETE 정책이 아예 없어 RLS 기본 거부로 아무도 삭제할 수 없다.
--    우연이지만 안전한 상태이고, 그대로 둔다.
--    근거: 고객이 이미 본 매물이 사라지면 혼란스럽고, chat_rooms.property_id가
--    on delete cascade라 매물을 지우면 대화 기록까지 함께 사라진다.
--    철회가 필요하면 property_status enum에 'withdrawn'을 추가하는 방법이 있으나
--    enum 추가는 migration을 두 번 나눠야 하고 MVP에 필요한 근거가 아직 없다. Later.
-- ========================================


-- ========================================
-- 4. response_count 재정의: 매물 수 -> 응답한 부동산 수
--
--    기존 트리거는 property INSERT마다 +1이라 "매물 수"를 셌다. 매물 5개가 한 부동산에서
--    온 것과 다섯 부동산에서 온 것은 중개사 입장에서 경쟁 상황이 완전히 다르다.
--
--    컬럼명은 유지한다. 이름을 바꾸면 호출부를 전부 손대야 하는 데 비해 얻는 게 없다.
--    대신 화면 문구를 "응답 N건" -> "N곳 응답"으로 바꾼다.
--
--    사용처: RealtorDashboard(경쟁도 표시). 고객 ResponseStatus는 이 컬럼을 쓰지 않고
--    properties 배열 길이를 쓴다.
--
--    ★ 지금은 DELETE가 없어 AFTER INSERT만으로 충분하다. 나중에 철회를 도입하면
--      AFTER DELETE 트리거도 함께 필요하다.
-- ========================================
create or replace function public.increment_response_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.requests
     set response_count = (
       select count(distinct p.realtor_id)
       from public.properties p
       where p.request_id = new.request_id
     )
   where id = new.request_id;
  return new;
end;
$$;

revoke all on function public.increment_response_count() from public, anon, authenticated;


-- ========================================
-- 5. 기존 response_count 백필
--
--    현재 값은 매물 수로 누적돼 있다. 부동산 수로 다시 계산한다.
--    ★ 데이터 수정이므로 CLAUDE.md 11번에 따라 별도 승인 후 실행한다.
--      아래는 주석 해제 전 반드시 승인받을 것.
-- ========================================
-- update requests r
--    set response_count = coalesce((
--          select count(distinct p.realtor_id)
--          from properties p
--          where p.request_id = r.id
--        ), 0);
--
-- 백필 전 확인 (차이가 나는 행이 몇 개인지)
--   select r.id, r.response_count as before,
--          coalesce((select count(distinct p.realtor_id) from properties p
--                    where p.request_id = r.id), 0) as after
--   from requests r
--   where r.response_count is distinct from
--         coalesce((select count(distinct p.realtor_id) from properties p
--                   where p.request_id = r.id), 0);


-- ========================================
-- 테스트
-- ========================================
-- C1 매물 1->5개 순차 제출 전부 성공
-- C2 6번째 제출 -> RLS 거부, 화면에 5/5 안내
-- C3 response_count가 부동산 수로 갱신 (중개사 2명 x 매물 5개 -> 2)
-- C4 고객 ResponseStatus에서 부동산별 아코디언, 매물 수 정확
-- C5 백필 후 기존 행의 response_count가 실제 distinct realtor 수와 일치
-- C6 매물 삭제 시도 -> 거부
-- C7 공개 매물(request_id null) 등록은 5개 제한/영업지역과 무관하게 계속 가능


-- ========================================
-- 함께 고쳐야 하는 프론트 (이 migration과 같은 배포에 포함)
-- ========================================
-- properties.api.js:28  23505 처리 문구 제거
--   '이미 이 요청서에 응답을 보내셨어요. 같은 요청에는 한 번만 응답할 수 있습니다.'
--   -> unique 제약이 사라져 이 경로는 더 이상 발생하지 않는다.
--      대신 5개 초과 시 RLS 거부(42501)를 "최대 5개까지 제안할 수 있어요"로 안내한다.


-- ========================================
-- 롤백 ★ 조건부 - 위 백업 안내 참고
-- ========================================
-- 1) 초과분이 없는지 먼저 확인 (0행이어야 아래 2)가 성공한다)
--    select request_id, realtor_id, count(*) from properties
--    where request_id is not null group by 1,2 having count(*) > 1;
--
-- 2) alter table properties
--      add constraint properties_request_realtor_unique unique (request_id, realtor_id);
--
-- 3) drop policy if exists "properties_insert_realtor" on properties;
--    create policy "properties_insert_realtor" on properties
--      for insert to authenticated
--      with check (
--        realtor_id = auth.uid() and public.current_user_role() = 'realtor'
--        and (request_id is null or exists (
--          select 1 from public.requests r
--          join public.realtor_service_areas sa on sa.district_code = r.district_code
--          where r.id = properties.request_id
--            and sa.realtor_id = auth.uid() and sa.area_type = 'district'))
--      );
--
-- 4) create or replace function public.increment_response_count()
--    returns trigger language plpgsql security definer
--    set search_path = pg_catalog, public as $$
--    begin
--      update public.requests set response_count = response_count + 1
--       where id = new.request_id;
--      return new;
--    end; $$;
--    -- + response_count 재백필 필요(매물 수 기준)
