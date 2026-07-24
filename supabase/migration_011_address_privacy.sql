-- 공개 매물의 상세주소 비공개 옵션: 동 단위 주소 + 근사 위치(약 100m 내 결정론적 어긋남)만 내려주는 함수
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_010_admin_access.sql까지 먼저 실행되어 있어야 함

alter table properties add column address_public boolean not null default true;

create or replace function public.get_public_listings()
returns table (
  id uuid,
  title text,
  description text,
  deposit integer,
  monthly_rent integer,
  room_type room_type,
  listing_status listing_status,
  created_at timestamptz,
  display_address text,
  display_lat double precision,
  display_lng double precision,
  property_images jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.description,
    p.deposit,
    p.monthly_rent,
    p.room_type,
    p.listing_status,
    p.created_at,
    case when p.address_public then p.address
         else regexp_replace(p.address, '^(.*?[동가읍면리])\s.*$', '\1')
    end as display_address,
    case when p.address_public then p.lat
         else p.lat + 0.0009 * sin(radians(abs(('x' || substr(md5(p.id::text), 1, 8))::bit(32)::int) % 360))
    end as display_lat,
    case when p.address_public then p.lng
         else p.lng + (0.0009 * cos(radians(abs(('x' || substr(md5(p.id::text), 1, 8))::bit(32)::int) % 360))) / cos(radians(p.lat))
    end as display_lng,
    coalesce(
      (select jsonb_agg(jsonb_build_object('image_url', pi.image_url, 'sort_order', pi.sort_order) order by pi.sort_order)
       from property_images pi where pi.property_id = p.id),
      '[]'::jsonb
    ) as property_images
  from properties p
  where p.is_public = true
    and p.listing_status = 'active'
    and p.lat is not null
    and p.lng is not null;
$$;

grant execute on function public.get_public_listings() to authenticated;
