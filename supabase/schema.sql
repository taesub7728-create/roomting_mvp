-- 룸팅(Roomting) MVP 데이터베이스 스키마
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 이 파일은 기록용입니다. 실제 반영은 Supabase SQL Editor에서 실행해야 적용됩니다.

-- ========================================
-- 1. ENUM 타입 정의 (고정된 선택지들)
-- ========================================

-- 계정 유형: 고객 / 공인중개사 / 에이전트(케어 패키지 담당) / 관리자
create type user_role as enum ('customer', 'realtor', 'care_agent', 'admin');

-- 방 타입 ('other'는 예비값으로 남겨두고, 화면에는 6개만 노출: 원룸/투룸/고시원/셰어하우스/오피스텔/아파트)
create type room_type as enum ('one_room', 'two_room', 'goshiwon', 'officetel', 'apartment', 'share_house', 'other');

-- 조건 요청서 상태
create type request_status as enum ('open', 'closed', 'expired');

-- 매물 응답 상태
create type property_status as enum ('submitted', 'viewed', 'selected');

-- 채팅 메시지 번역 상태 (번역 API 실패 시 원문만 보여주기 위한 플래그)
create type translation_status as enum ('success', 'failed', 'pending');

-- 에이전트 케어 패키지 상태 (MVP에서는 테이블만 존재, 실제 매칭 로직은 이후 단계)
create type care_package_status as enum ('requested', 'matched', 'in_progress', 'done');


-- ========================================
-- 2. profiles: 로그인 계정의 추가 정보
--    (auth.users는 Supabase Auth가 자동 관리하는 테이블 - 이메일/비번/소셜로그인 정보)
-- ========================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  nickname text not null,
  preferred_language text not null default 'ko',
  phone text,
  created_at timestamptz not null default now()
);

-- 회원가입 시 auth.users에 계정이 생기면 자동으로 profiles 행도 만들어주는 트리거
-- role, nickname, preferred_language는 회원가입 화면에서 signUp 호출 시 options.data로 전달한 값을 사용
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname, role, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'ko')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ========================================
-- 3. requests: 조건 요청서 (고객이 직접 작성하거나, 에이전트가 대리 작성)
-- ========================================
create table requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade, -- 조건의 실제 당사자(고객)
  created_by uuid not null references profiles(id) on delete cascade,  -- 실제로 이 요청서를 작성한 사람(고객 본인 또는 에이전트)
  region_text text not null, -- 희망 지역/지하철역 (자유 텍스트)
  rent_max integer, -- 월세 최대 (만원 단위)
  deposit_max integer, -- 보증금 최대 (만원 단위)
  room_types room_type[] not null default '{}', -- 방 타입 복수 선택 가능
  contract_months integer, -- 희망 계약 기간(개월)
  amenities text[] not null default '{}', -- 세탁기/에어컨/주차 등 편의시설 요청 (자유 태그)
  extra_note text, -- 추가 요청사항 자유 입력
  move_in_date date,
  registration_required boolean not null default false, -- 전입신고 가능 여부
  status request_status not null default 'open',
  response_deadline timestamptz not null default (now() + interval '24 hours'),
  response_count integer not null default 0, -- 표시용 카운트 (결제/과금 로직 없음)
  created_at timestamptz not null default now()
);

create index idx_requests_customer on requests(customer_id);
create index idx_requests_status on requests(status);


-- ========================================
-- 4. properties: 공인중개사가 요청서에 응답하는 매물
-- ========================================
create table properties (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  realtor_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  address text,
  description text,
  deposit integer,
  monthly_rent integer,
  room_type room_type not null,
  status property_status not null default 'submitted',
  created_at timestamptz not null default now()
);

create index idx_properties_request on properties(request_id);
create index idx_properties_realtor on properties(realtor_id);

-- 매물 응답이 새로 등록되면 해당 요청서의 response_count를 자동으로 +1
create or replace function public.increment_response_count()
returns trigger as $$
begin
  update requests set response_count = response_count + 1 where id = new.request_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_increment_response_count
  after insert on properties
  for each row execute function public.increment_response_count();


-- ========================================
-- 5. property_images: 매물 사진 (매물 1개당 여러 장)
-- ========================================
create table property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0
);

create index idx_property_images_property on property_images(property_id);


-- ========================================
-- 6. favorites: 고객이 찜한 매물
-- ========================================
create table favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, property_id)
);


-- ========================================
-- 7. chat_rooms / chat_messages: 채팅 + 자동번역
-- ========================================
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  realtor_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (property_id) -- 매물 응답 하나당 채팅방 1개
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  original_text text not null,
  original_language text not null,
  translated_text text,
  translated_language text,
  translation_status translation_status not null default 'pending', -- 번역 API 실패 시 'failed'로 남기고 원문만 표시
  created_at timestamptz not null default now()
);

create index idx_chat_messages_room on chat_messages(chat_room_id);


-- ========================================
-- 8. care_packages: 에이전트 케어 패키지 (MVP 이후 기능, 지금은 뼈대만)
-- ========================================
create table care_packages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  care_agent_id uuid references profiles(id) on delete set null,
  status care_package_status not null default 'requested',
  created_at timestamptz not null default now()
);


-- ========================================
-- 9. 모든 테이블 RLS(Row Level Security) 활성화
--    -> 지금은 켜기만 하고, 세부 정책(누가 뭘 볼 수 있는지)은 다음 단계에서 작성합니다.
--    -> 정책을 추가하기 전까지는 일반 API 키로는 아무 데이터도 읽고 쓸 수 없는 "잠금" 상태입니다 (안전).
-- ========================================
alter table profiles enable row level security;
alter table requests enable row level security;
alter table properties enable row level security;
alter table property_images enable row level security;
alter table favorites enable row level security;
alter table chat_rooms enable row level security;
alter table chat_messages enable row level security;
alter table care_packages enable row level security;
