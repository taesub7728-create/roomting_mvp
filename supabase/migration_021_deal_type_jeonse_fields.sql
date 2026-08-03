-- 마이그레이션 021: 거래 유형(월세/전세) + 전세자금대출 + 전세보증금 범위 필드 추가
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_020_property_category.sql까지 먼저 실행되어 있어야 함

create type deal_type as enum ('rent', 'jeonse');

alter table requests
  add column if not exists deal_type deal_type not null default 'rent',
  add column if not exists jeonse_loan_planned boolean default null,
  add column if not exists jeonse_loan_detail text,
  add column if not exists deposit_min integer;

comment on column requests.jeonse_loan_planned is
  'null=아직 선택 안 함, true=이용함, false=이용 안 함. deal_type=rent일 때는 항상 null 유지';
comment on column requests.deposit_min is
  '전세 희망 보증금 범위의 최소값(만원, 선택). deal_type=rent일 때는 항상 null. '
  'deposit_max(기존 컬럼, 만원)를 전세 보증금 최대값으로 재사용하며 jeonse에서는 필수.';

-- ========================================
-- CHECK 1: deal_type과 전세대출 필드 조합 (대출 여부 관심사)
-- ========================================
alter table requests
  add constraint requests_jeonse_loan_consistency
  check (
    (
      deal_type = 'rent'
      and jeonse_loan_planned is null
      and jeonse_loan_detail is null
    )
    or
    (
      deal_type = 'jeonse'
      and jeonse_loan_planned is not null
      and (
        jeonse_loan_planned = true
        or jeonse_loan_detail is null
      )
    )
  );

-- ========================================
-- CHECK 2: deal_type과 보증금 범위 필드 조합 (금액 범위 관심사, 별도 분리)
-- rent에서는 deposit_min=null만 요구하고 기존 deposit_max/rent_max 규칙에는 개입하지 않는다
-- (기존 월세 데이터에 영향 없음)
-- ========================================
alter table requests
  add constraint requests_deposit_range_consistency
  check (
    (
      deal_type = 'rent'
      and deposit_min is null
    )
    or
    (
      deal_type = 'jeonse'
      and deposit_max is not null
      and deposit_max > 0
      and (
        deposit_min is null
        or (
          deposit_min > 0
          and deposit_min <= deposit_max
        )
      )
    )
  );

-- 백필 확인용 (실행 후 아래 두 쿼리로 각각 0건인지 직접 확인)
-- 기존 행은 deal_type default 'rent' + 전세 관련 필드 전부 null이라 두 CHECK 모두 branch1을 그대로 통과해야 함
-- select count(*) from requests
--   where not (
--     (deal_type = 'rent' and jeonse_loan_planned is null and jeonse_loan_detail is null)
--     or (deal_type = 'jeonse' and jeonse_loan_planned is not null and (jeonse_loan_planned = true or jeonse_loan_detail is null))
--   );
-- select count(*) from requests
--   where not (
--     (deal_type = 'rent' and deposit_min is null)
--     or (deal_type = 'jeonse' and deposit_max is not null and deposit_max > 0
--         and (deposit_min is null or (deposit_min > 0 and deposit_min <= deposit_max)))
--   );

-- 롤백
-- alter table requests drop constraint if exists requests_deposit_range_consistency;
-- alter table requests drop constraint if exists requests_jeonse_loan_consistency;
-- alter table requests drop column if exists deposit_min;
-- alter table requests drop column if exists deal_type;
-- alter table requests drop column if exists jeonse_loan_planned;
-- alter table requests drop column if exists jeonse_loan_detail;
-- drop type if exists deal_type;
