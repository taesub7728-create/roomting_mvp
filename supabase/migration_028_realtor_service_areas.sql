-- 마이그레이션 028: 중개사 영업지역 + 승인 흐름 통합
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_027_requests_location.sql까지 먼저 실행되어 있어야 함
--
-- ============================================================================
-- 설계 의도
-- ============================================================================
--
-- [1] area_type enum에 미래 값(station/radius)을 미리 정의하되 CHECK로 district만
--     허용한다. migration_020/027과 동일한 패턴이다.
--
-- [2] 신청(desired_district_codes)과 확정 권한(realtor_service_areas)을 분리한다.
--     이 프로젝트가 이미 지키는 원칙과 같다 - "심사 상태는 role 값으로 표현하지 않는다,
--     권한과 신청 상태를 분리한다"(TODO_PHASE2.md 장기 Role 정책).
--     가입자는 승인 전까지 role='customer'이므로, 그 시점에 확정 권한 테이블에 행을
--     넣으면 안 된다.
--
-- [3] realtor_service_areas의 INSERT/UPDATE/DELETE는 admin만 가능하다.
--     이것이 이번 작업의 핵심 방어 지점이다. 중개사가 스스로 행을 넣을 수 있으면
--     서울 25개 구를 전부 등록해 전국 열람을 그대로 복원할 수 있다.
--     중개사 화면은 조회 전용이고, 변경은 admin에게 문의하는 흐름이다.
--
-- [4] approve_realtor_application()은 role 변경과 영업지역 부여를 한 트랜잭션으로
--     묶는다. 두 번의 개별 호출은 중간 실패 시 "승인됐는데 영업지역 없음"을 만들고,
--     그 중개사는 요청서를 0건 보게 된다.
--     영업지역이 비면 승인 자체를 거부한다 -> admin이 빈 채로 승인 버튼을 누를 수 없다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: 신규 테이블 1개 + realtor_applications 컬럼 1개 + RPC 1개
--             / API: approveRealtorApplication() 교체 예정 / 사용자 흐름: admin 승인
--   영향 받는 기능: realtor_applications INSERT - 새 컬럼이 nullable이라 기존 호출 그대로 동작
--   영향 없음: requests / properties / chat 전부 / 기존 RLS 전부 / 인증 흐름
--   개인정보: desired_district_codes는 사업 정보이지 개인정보가 아니다.
--            조회 범위는 realtor_applications 기존 정책(본인 또는 admin)을 그대로 따른다.


-- ========================================
-- 1. 영업지역 테이블
-- ========================================
create type service_area_type as enum ('district', 'station', 'radius');

create table realtor_service_areas (
  id            uuid primary key default gen_random_uuid(),
  realtor_id    uuid not null references profiles(id) on delete cascade,
  area_type     service_area_type not null default 'district',
  district_code text references districts(code),
  created_at    timestamptz not null default now(),

  unique (realtor_id, area_type, district_code)
);

-- 현재 출시 단계에서 실제로 저장 가능한 값은 district만
alter table realtor_service_areas
  add constraint rsa_type_district_only check (area_type = 'district');

alter table realtor_service_areas
  add constraint rsa_district_complete
  check (area_type <> 'district' or district_code is not null);

-- 라우팅 조회용 (029의 exists 서브쿼리가 쓴다)
create index idx_rsa_realtor on realtor_service_areas(realtor_id, district_code);


-- ========================================
-- RLS
--   select : 본인 또는 admin
--   insert/update/delete : admin만  <- 설계 의도 [3]
-- ========================================
alter table realtor_service_areas enable row level security;

create policy "rsa_select_own_or_admin" on realtor_service_areas
  for select to authenticated
  using (realtor_id = auth.uid() or public.current_user_role() = 'admin');

create policy "rsa_insert_admin" on realtor_service_areas
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

create policy "rsa_update_admin" on realtor_service_areas
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "rsa_delete_admin" on realtor_service_areas
  for delete to authenticated
  using (public.current_user_role() = 'admin');


-- ========================================
-- 2. 지원서에 희망 영업지역 추가
--    가입 폼 UI는 Later. 컬럼만 먼저 만들어 두고, 당분간은 admin이 등록증 소재지를
--    보고 승인 화면에서 직접 지정한다.
--    배열에는 FK를 걸 수 없다. 실제 검증은 approve 시 realtor_service_areas의
--    district_code FK가 담당한다(존재하지 않는 코드면 23503으로 승인이 실패한다).
-- ========================================
alter table realtor_applications
  add column if not exists desired_district_codes text[];

comment on column realtor_applications.desired_district_codes is
  '신청자가 희망한 영업지역 시군구 코드. 참고값이며 확정 권한이 아니다. '
  '실제 권한은 admin이 승인 시 realtor_service_areas에 넣는 값이다.';


-- ========================================
-- 3. 승인 RPC (role 변경 + 영업지역 부여를 한 트랜잭션으로)
--
--    SECURITY DEFINER 안전 원칙:
--      - 호출자 판정은 auth.uid() 기반 current_user_role()로만 한다.
--        p_district_codes는 "누가 호출하는가"가 아니라 "무엇을 부여하는가"이며,
--        admin 검사를 통과한 뒤에만 행사된다.
--      - search_path 고정, 본문 schema-qualified, 동적 SQL 없음
--      - PUBLIC/anon EXECUTE 회수, authenticated에만 EXECUTE 부여
--      - owner는 postgres(bypassrls)이므로 이 함수 본문이 유일한 방어선이다.
--        admin 검사를 지우면 누구나 자신을 realtor로 승격할 수 있다.
-- ========================================
create or replace function public.approve_realtor_application(
  p_profile_id     uuid,
  p_district_codes text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_district_codes is null or array_length(p_district_codes, 1) is null then
    raise exception 'at least one service area is required'
      using errcode = '23514';
  end if;

  update public.profiles set role = 'realtor' where id = p_profile_id;
  if not found then
    raise exception 'profile not found: %', p_profile_id using errcode = '23503';
  end if;

  insert into public.realtor_service_areas (realtor_id, area_type, district_code)
  select p_profile_id, 'district', code
  from unnest(p_district_codes) as code
  on conflict (realtor_id, area_type, district_code) do nothing;
end;
$$;

revoke all on function public.approve_realtor_application(uuid, text[]) from public, anon;
grant execute on function public.approve_realtor_application(uuid, text[]) to authenticated;


-- ========================================
-- 적용 후 확인
-- ========================================
-- 영업지역 미등록 realtor 탐지 (030 적용 전에 0행이어야 한다)
--   select p.id, p.nickname, ra.company_name, ra.company_address
--   from profiles p
--   left join realtor_service_areas sa on sa.realtor_id = p.id
--   left join realtor_applications ra on ra.profile_id = p.id
--   where p.role = 'realtor' and sa.id is null;
--
-- 공격 차단 확인 (중개사 세션, begin/rollback)
--   insert into realtor_service_areas (realtor_id, area_type, district_code)
--   values (auth.uid(), 'district', '11680');   -- RLS 거부되어야 함
--
-- 승인 거부 확인 (admin 세션)
--   select approve_realtor_application('<uuid>', '{}');    -- 23514 예외
--   select approve_realtor_application('<uuid>', null);    -- 23514 예외


-- ========================================
-- 롤백
-- ========================================
-- drop function if exists public.approve_realtor_application(uuid, text[]);
-- alter table realtor_applications drop column if exists desired_district_codes;
-- drop table if exists realtor_service_areas;
-- drop type if exists service_area_type;
