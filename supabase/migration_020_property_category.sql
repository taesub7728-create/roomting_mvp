-- 마이그레이션 020: requests에 property_category 컬럼 추가 (주거/사무실/상가 확장 대비)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
--
-- 설계 의도:
--   컬럼 타입(enum)에는 향후 확장분(office/retail)까지 미리 정의해두되,
--   현재 출시 단계에서 실제로 저장 가능한 값은 CHECK constraint로 residential만 허용한다.
--   room_type enum에 이미 UI 미노출 예비값 'other'가 있는 것과 동일한 패턴이다(schema.sql 참고).
--
--   타입이 허용하는 값: residential / office / retail (전부)
--   현재 DB가 실제 허용하는 값: residential만 (아래 CHECK)
--   향후 office/retail을 열 때: ALTER TYPE 불필요, 아래 CHECK constraint만
--   drop 후 새 CHECK(또는 무제한)로 교체하는 새 migration 파일 1개만 추가하면 됨.

create type property_category as enum ('residential', 'office', 'retail');

alter table requests
  add column if not exists property_category property_category not null default 'residential';

-- 서버 측 강제: DevTools/직접 API 호출로도 residential 외 값은 저장 불가
alter table requests
  add constraint requests_property_category_residential_only
  check (property_category = 'residential');

-- 백필 확인용 (실행 후 아래 쿼리로 0건인지 직접 확인)
-- select count(*) from requests where property_category is distinct from 'residential';

-- 롤백
-- alter table requests drop constraint if exists requests_property_category_residential_only;
-- alter table requests drop column if exists property_category;
-- drop type if exists property_category;
