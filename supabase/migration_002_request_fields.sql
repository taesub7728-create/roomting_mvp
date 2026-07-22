-- 마이그레이션 002: 조건 요청서(requests) 테이블을 실제 프로토타입 화면 구조에 맞게 수정
-- 실행 방법: 아래 STEP 1을 먼저 실행(Run)해서 완료한 뒤, 새 쿼리 창을 열어 STEP 2를 실행
-- (enum에 새 값을 추가하는 작업은 같은 트랜잭션 안에서 바로 사용할 수 없어서 두 단계로 나눔)

-- ── STEP 1 ── 방 타입에 '고시원' 추가
alter type room_type add value if not exists 'goshiwon';


-- ── STEP 2 ── (STEP 1 실행 완료 후, 새 쿼리 창에서 아래를 실행)
-- 예산을 "월세 최대 / 보증금 최대"로 분리하고, 방 타입을 복수 선택 가능하도록 변경,
-- 계약기간/편의시설/추가요청 컬럼 추가
alter table requests
  drop column if exists budget_min,
  drop column if exists budget_max,
  drop column if exists room_type,
  add column if not exists rent_max integer,
  add column if not exists deposit_max integer,
  add column if not exists room_types room_type[] not null default '{}',
  add column if not exists contract_months integer,
  add column if not exists amenities text[] not null default '{}',
  add column if not exists extra_note text;
