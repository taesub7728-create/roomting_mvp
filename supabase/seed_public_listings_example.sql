-- 지도 화면 테스트용 샘플 공개 매물 (마이그레이션 아님 - 필요할 때만 수동 실행)
-- 실행 방법: migration_009_public_listings.sql을 먼저 실행한 뒤, Supabase SQL Editor에서 실행
-- 기존에 가입된 공인중개사(realtor) 계정 1명을 자동으로 찾아서 그 이름으로 매물을 등록함
-- 공인중개사 계정이 하나도 없으면 먼저 파트너 회원가입을 하고 실행할 것

do $$
declare
  sample_realtor_id uuid;
  prop_id uuid;
begin
  select id into sample_realtor_id from profiles where role = 'realtor' limit 1;

  if sample_realtor_id is null then
    raise notice '공인중개사 계정이 없어서 샘플 매물을 만들지 못했어요. 파트너 회원가입을 먼저 진행해주세요.';
    return;
  end if;

  -- 합정역 인근
  insert into properties (realtor_id, is_public, title, address, description, deposit, monthly_rent, room_type, lat, lng)
  values (sample_realtor_id, true, '합정역 도보 5분 신축 원룸', '서울특별시 마포구 합정동', '역세권 풀옵션 원룸이에요', 1000, 55, 'one_room', 37.5495, 126.9139)
  returning id into prop_id;
  insert into property_images (property_id, image_url, sort_order) values (prop_id, 'https://placehold.co/600x400?text=Hapjeong', 0);

  -- 강남역 인근
  insert into properties (realtor_id, is_public, title, address, description, deposit, monthly_rent, room_type, lat, lng)
  values (sample_realtor_id, true, '강남역 5분거리 오피스텔', '서울특별시 강남구 역삼동', '주차 가능, 즉시 입주', 3000, 90, 'officetel', 37.4979, 127.0276)
  returning id into prop_id;
  insert into property_images (property_id, image_url, sort_order) values (prop_id, 'https://placehold.co/600x400?text=Gangnam', 0);

  -- 홍대입구역 인근
  insert into properties (realtor_id, is_public, title, address, description, deposit, monthly_rent, room_type, lat, lng)
  values (sample_realtor_id, true, '홍대 투룸 셰어하우스', '서울특별시 마포구 서교동', '외국인 환영, 풀옵션', 500, 65, 'share_house', 37.5563, 126.9236)
  returning id into prop_id;
  insert into property_images (property_id, image_url, sort_order) values (prop_id, 'https://placehold.co/600x400?text=Hongdae', 0);
end $$;
