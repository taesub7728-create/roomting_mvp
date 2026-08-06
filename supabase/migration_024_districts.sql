-- 마이그레이션 024: districts (시군구 코드 마스터)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_023_profiles_lockdown.sql까지 먼저 실행되어 있어야 함
--
-- 설계 의도:
--   중개사 영업지역 라우팅의 1차 기준은 표준 시군구 코드다.
--   이 테이블은 시군구 5자리만 담는다. 법정동/행정동은 층위가 다르므로 같은 필드에
--   섞지 않고, 필요해지면 legal_dongs / admin_dongs 테이블을 따로 만들어
--   districts.code를 참조하게 한다.
--
--   출처: 행정안전부 행정표준코드 법정동코드 (https://www.code.go.kr)
--   법정동코드 10자리 = 시도(2) + 시군구(3) + 읍면동(3) + 리(2)
--   시군구 코드 = 앞 5자리. 예) 11440 = 서울특별시(11) 마포구(440)
--
--   source / source_version 컬럼으로 어느 고시본을 적재했는지 추적한다.
--   폐지/통합된 구는 삭제하지 않고 valid_to를 채운다 - 과거 요청서가 참조 중일 수 있다.
--
-- 확장축 (1): 경기(41)/인천(28)은 sido_code가 다른 행을 추가하는 것으로 끝난다.
--             스키마 변경이 없다.
--
-- 영향 범위:
--   변경 대상: 신규 테이블 1개
--   영향 받는 기능: 없음 (아직 아무도 참조하지 않음)
--   영향 없음: 기존 8개 테이블 - 참조 관계 없음 / 기존 RLS - 무변경 / 인증 흐름 - 무관


create table districts (
  code           text primary key,          -- 시군구 코드 5자리. '11440'
  sido_code      text not null,             -- 시도 코드 2자리. '11'
  name_ko        text not null,
  name_en        text,
  name_ja        text,
  name_zh        text,
  source         text not null,             -- '행정안전부 행정표준코드 법정동코드'
  source_version text not null,             -- 다운로드/고시 기준일. 'YYYYMMDD'
  valid_from     date,
  valid_to       date,                      -- 폐지/통합 시 기록. 행은 삭제하지 않는다
  created_at     timestamptz not null default now(),

  constraint districts_code_format check (code ~ '^[0-9]{5}$'),
  constraint districts_sido_prefix check (left(code, 2) = sido_code)
);

create index idx_districts_sido on districts(sido_code);
create index idx_districts_active on districts(code) where valid_to is null;


-- ========================================
-- RLS: 행정구역 코드는 공개 정보라 읽기를 전면 허용한다.
--      쓰기 정책은 만들지 않는다 -> 시드/갱신은 SQL Editor(postgres)로만 가능.
--      비로그인 사용자도 역 검색 결과에서 구 이름을 봐야 하므로 anon에도 허용한다.
-- ========================================
alter table districts enable row level security;

create policy "districts_select_all" on districts
  for select to authenticated, anon
  using (true);


-- ========================================
-- 롤백
-- ========================================
-- drop table if exists districts;   -- 참조 0건이므로 무조건 성공
