-- ============================================================================
-- 복원 리허설 스크립트 (migration 이 아니다 · 도구)
--
-- ★ 이 파일은 migration 이 아니다. 번호가 없고 순서에 포함되지 않는다.
--   백업 JSON 이 있을 때 "그 백업으로 실제 복원이 되는가"를 검증하는 도구다.
--
-- ★★ 이 파일에는 백업 데이터가 들어 있지 않다. 앞으로도 넣지 않는다. ★★
--   이 저장소는 public 이고 백업에는 실제 대화 내용과 고객 UUID 가 들어간다.
--   백업 JSON 은 저장소 밖에 두고, 실행 시점에만 아래 자리에 붙여넣는다.
--
-- 최초 작성/검증: 2026-08-11 (migration_031 적용 전 P4 리허설)
-- 대상: properties / property_images / favorites / chat_rooms / chat_messages
--       + requests 카운터 스냅샷(snapshot-only, 복원 대상 아님)
-- 설계 근거·READY 게이트: TODO_PHASE2.md 「031 백업 설계」
--
-- ============================================================================
-- ★★ COMMIT 이 이 파일에 없다. 실행 전 직접 검색해 0건임을 확인할 것 ★★
--   프로덕션이 바뀌려면 COMMIT 을 직접 타이핑하는 수밖에 없다.
--   중간에 오류가 나면 더 진행하지 말고 rollback; 을 단독 실행한 뒤
--   preflight baseline 을 재확인한다(비상 절차는 TODO_PHASE2.md 참고).
--   이 비상 rollback 은 되돌리는 방향이라 언제 실행해도 안전하다.
--
-- ============================================================================
-- ★★ 정상 통과해도 예외가 발생한다 ★★
--   메시지가 'P4 RESULT' 로 시작하면 그것이 리포트다. 실패가 아니다.
--   두 가지 이유로 예외를 쓴다:
--     (1) Supabase SQL Editor 는 마지막 문장의 결과만 표시한다(저장소 실측,
--         TODO_PHASE2.md 39번). rollback 앞의 SELECT 결과는 보이지 않는다.
--         예외 메시지는 트랜잭션과 무관하게 항상 전달된다.
--     (2) 예외가 트랜잭션을 abort 시켜 commit 경로를 구조적으로 제거한다.
--   temp table 로 결과를 넘기는 방법은 쓸 수 없다 - temp table 생성은 트랜잭션
--   밖이라 살아남지만 그 안에 넣은 행(DML)은 다른 테이블과 똑같이 롤백된다.
-- ============================================================================


-- ── STEP 0 : 백업 적재 (트랜잭션 밖. 재실행 안전) ──────────────────────
create temp table if not exists _src (j jsonb);
delete from _src;

insert into _src values (
$BACKUP$
<PASTE BACKUP JSON HERE>
$BACKUP$::jsonb
);


-- ── STEP 1 : DRIFT GATE (read-only, 트랜잭션 진입 전) ──────────────────
--    행 수 비교로는 기존 행의 "수정"을 잡지 못한다. 백업 생성 쿼리와 동일한
--    canonical ordering 으로 다시 만들어 JSONB equality 로 비교한다.
--
--    ★ 이 gate 가 필요한 결정적 이유:
--      백업 이후 새 child row 가 같은 property 를 참조하게 되면(새 채팅 메시지,
--      새 찜 등), 아래 ① 의 부모 DELETE 가 ON DELETE CASCADE 로 그 신규 행까지
--      지운다. 그 행은 백업에 없어 ② 가 되살리지 못한다.
--      리허설이면 롤백되지만 실제 복원이었다면 소실이다.
--      gate 가 그 상황을 트랜잭션 진입 전에 차단한다.
--
--    drift 가 있으면 예외로 멈추고 begin; 에 도달하지 않는다.
do $$
declare
  b jsonb;
  bad text := '';
begin
  select j into b from _src;
  if b is null then
    raise exception 'STOP — backup JSON 이 _src 에 적재되지 않았습니다';
  end if;

  if (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
        from properties t) is distinct from (b->'properties')
    then bad := bad || 'properties '; end if;

  if (select coalesce(jsonb_agg(t order by t.property_id, t.sort_order, t.id), '[]'::jsonb)
        from property_images t) is distinct from (b->'property_images')
    then bad := bad || 'property_images '; end if;

  if (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
        from favorites t) is distinct from (b->'favorites')
    then bad := bad || 'favorites '; end if;

  if (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
        from chat_rooms t) is distinct from (b->'chat_rooms')
    then bad := bad || 'chat_rooms '; end if;

  if (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
        from chat_messages t) is distinct from (b->'chat_messages')
    then bad := bad || 'chat_messages '; end if;

  if (select coalesce(jsonb_agg(jsonb_build_object(
                'id', r.id, 'response_count', r.response_count,
                'status', r.status, 'created_at', r.created_at
              ) order by r.created_at, r.id), '[]'::jsonb)
        from requests r) is distinct from (b->'requests_snapshot')
    then bad := bad || 'requests_snapshot '; end if;

  if bad <> '' then
    raise exception E'STOP — backup 이후 drift 감지\n불일치: %\n리허설을 실행하지 않습니다. 백업을 다시 뜨거나 원인을 조사하세요.', bad;
  end if;

  raise notice 'DRIFT GATE PASS — 6/6 동일';
end $$;


-- ── STEP 2 : 리허설 (트랜잭션) ─────────────────────────────────────────
begin;

-- ① DELETE : 자식 -> 부모. 백업에 실재하는 id 만 지운다.
--    ★ id 명시 가드가 필수다. rls_forced=false + owner=postgres 실측 확인 -
--      SQL Editor 는 RLS 를 우회하므로 where 없는 DELETE 가 전 행을 지운다.
--      where request_id = … 같은 조건식도 쓰지 않는다(백업에 없는 행이 범위에 들어온다).
delete from chat_messages
 where id in (select (e->>'id')::uuid from _src s, jsonb_array_elements(s.j->'chat_messages') e);

delete from chat_rooms
 where id in (select (e->>'id')::uuid from _src s, jsonb_array_elements(s.j->'chat_rooms') e);

delete from favorites
 where id in (select (e->>'id')::uuid from _src s, jsonb_array_elements(s.j->'favorites') e);

delete from property_images
 where id in (select (e->>'id')::uuid from _src s, jsonb_array_elements(s.j->'property_images') e);

delete from properties
 where id in (select (e->>'id')::uuid from _src s, jsonb_array_elements(s.j->'properties') e);

-- ② INSERT : 부모 -> 자식. jsonb_populate_recordset 이 컬럼 이름으로 자동 매핑한다.
--    created_at 이 JSON 에 있으므로 default now() 가 적용되지 않는다(원본 시각 보존).
insert into properties
select r.* from _src s, jsonb_populate_recordset(null::properties,      s.j->'properties')      r;
insert into property_images
select r.* from _src s, jsonb_populate_recordset(null::property_images, s.j->'property_images') r;
insert into favorites
select r.* from _src s, jsonb_populate_recordset(null::favorites,       s.j->'favorites')       r;
insert into chat_rooms
select r.* from _src s, jsonb_populate_recordset(null::chat_rooms,      s.j->'chat_rooms')      r;
insert into chat_messages
select r.* from _src s, jsonb_populate_recordset(null::chat_messages,   s.j->'chat_messages')   r;

-- ⑥ response_count 원복 + 검증 V1/V2/V2b/V3/V4
--
-- ★ 2026-08-11 수정: format('%s', boolean) 은 't'/'f' 를 낸다(boolean 의 출력 함수).
--   'true'/'false' 는 ::text 캐스트의 결과다. 최초 실행본이 이 둘을 혼동해
--   측정값이 전부 정상인데도 '★ FAIL' 을 출력했다.
--
--   그래서 3계층으로 분리했다:
--     측정 -> 변수(int / boolean)
--     판정 -> 변수끼리 직접 비교. 문자열을 거치지 않는다
--     표시 -> 마지막에 한 번만 문자열로 만든다(::text 명시)
--   판정이 표시 형식에 의존하지 않으므로 렌더링 규칙이 바뀌어도 판정은 안 깨진다.
--   기대 행 수를 문자열에 박아두던 V1 정규식도 같은 이유로 정수 비교로 바꿨다.
do $$
declare
  b jsonb;
  -- 측정값
  n_prop int; n_img int; n_fav int; n_room int; n_msg int;
  e_prop int; e_img int; e_fav int; e_room int; e_msg int;
  v2_bad int; v2b int;
  o_img int; o_room int; o_msg int; o_fav int;
  eq_prop boolean; eq_img boolean; eq_fav boolean; eq_room boolean; eq_msg boolean;
  -- 판정
  ok_v1 boolean; ok_v2 boolean; ok_v2b boolean; ok_v3 boolean; ok_v4 boolean; ok_all boolean;
begin
  select j into b from _src;

  -- ⑥ 증분 트리거가 부풀린 카운터를 스냅샷 값으로 되돌린다.
  --    ★ 트리거를 끄지 않는 이유: is_superuser=false 실측으로 session_replication_role 이
  --      불가함이 확인됐고, DISABLE TRIGGER 는 켜기를 잊으면 조용히 고장 난다.
  --      response_count 는 파생값이라 특권 조작으로 지킬 이유가 없다.
  update requests r
     set response_count = (e->>'response_count')::int
    from jsonb_array_elements(b->'requests_snapshot') e
   where r.id = (e->>'id')::uuid
     and r.response_count is distinct from (e->>'response_count')::int;
  get diagnostics v2b = row_count;

  select count(*) into n_prop from properties;
  select count(*) into n_img  from property_images;
  select count(*) into n_fav  from favorites;
  select count(*) into n_room from chat_rooms;
  select count(*) into n_msg  from chat_messages;

  e_prop := jsonb_array_length(b->'properties');
  e_img  := jsonb_array_length(b->'property_images');
  e_fav  := jsonb_array_length(b->'favorites');
  e_room := jsonb_array_length(b->'chat_rooms');
  e_msg  := jsonb_array_length(b->'chat_messages');

  select count(*) into v2_bad
    from jsonb_array_elements(b->'requests_snapshot') e
    join requests r on r.id = (e->>'id')::uuid
   where r.response_count is distinct from (e->>'response_count')::int;

  select count(*) into o_img  from property_images pi
   where not exists (select 1 from properties p where p.id = pi.property_id);
  select count(*) into o_room from chat_rooms cr
   where not exists (select 1 from properties p where p.id = cr.property_id);
  select count(*) into o_msg  from chat_messages cm
   where not exists (select 1 from chat_rooms cr where cr.id = cm.chat_room_id);
  select count(*) into o_fav  from favorites f
   where not exists (select 1 from properties p where p.id = f.property_id);

  -- V4 : 백업 생성 쿼리와 동일한 canonical ordering 으로 full equality
  --   ★ V4 가 참이면 행 수·UUID 집합·정렬·created_at·nullable·본문·boolean·
  --     image_url 문자열이 전부 백업과 동일하다는 뜻이다. 별도 UUID set 검사(V5)는
  --     중복이라 만들지 않았다. V4 가 덮지 못하는 것은 Storage 객체의 실재 하나뿐이다.
  eq_prop := (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
                from properties t)      = (b->'properties');
  eq_img  := (select coalesce(jsonb_agg(t order by t.property_id, t.sort_order, t.id), '[]'::jsonb)
                from property_images t) = (b->'property_images');
  eq_fav  := (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
                from favorites t)       = (b->'favorites');
  eq_room := (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
                from chat_rooms t)      = (b->'chat_rooms');
  eq_msg  := (select coalesce(jsonb_agg(t order by t.created_at, t.id), '[]'::jsonb)
                from chat_messages t)   = (b->'chat_messages');

  -- 판정 : 전부 변수 직접 비교
  ok_v1  := (n_prop = e_prop) and (n_img = e_img) and (n_fav = e_fav)
            and (n_room = e_room) and (n_msg = e_msg);
  ok_v2  := (v2_bad = 0);
  -- V2b 기대값은 "request_id 가 NOT NULL 인 백업 property 가 속한 request 중
  -- 카운터가 실제로 어긋난 행 수"다. 2026-08-11 스냅샷 기준으로는 1이었다.
  -- 데이터가 달라지면 이 기대값도 달라진다 - 0 이면 트리거 미발동을 의심한다.
  ok_v2b := (v2b >= 1);
  ok_v3  := (o_img = 0) and (o_room = 0) and (o_msg = 0) and (o_fav = 0);
  ok_v4  := eq_prop and eq_img and eq_fav and eq_room and eq_msg;
  ok_all := ok_v1 and ok_v2 and ok_v2b and ok_v3 and ok_v4;

  -- 표시 : 여기서만 문자열로 만든다. ::text 는 'true'/'false' 를 낸다.
  raise exception E'\n=== P4 RESULT: % ===\nV1  rows      [%] : properties %/%, images %/%, favorites %/%, rooms %/%, messages %/%\nV2  counter   [%] : mismatch %  (기대 0)\nV2b step6 fix [%] : %  (기대 >= 1)\nV3  orphans   [%] : images %, rooms %, messages %, favorites %  (기대 전부 0)\nV4  canonical [%] : properties %, images %, favorites %, rooms %, messages %  (기대 전부 true)\n=== 이 예외는 리포트 전달 + commit 방지용이다. 이어서 rollback; 을 실행하세요 ===',
    case when ok_all then 'PASS' else '★ FAIL' end,
    case when ok_v1  then 'OK' else 'NG' end, n_prop, e_prop, n_img, e_img, n_fav, e_fav, n_room, e_room, n_msg, e_msg,
    case when ok_v2  then 'OK' else 'NG' end, v2_bad,
    case when ok_v2b then 'OK' else 'NG' end, v2b,
    case when ok_v3  then 'OK' else 'NG' end, o_img, o_room, o_msg, o_fav,
    case when ok_v4  then 'OK' else 'NG' end,
    eq_prop::text, eq_img::text, eq_fav::text, eq_room::text, eq_msg::text;
end $$;

rollback;


-- ============================================================================
-- 실패 판별
-- ============================================================================
-- STOP — backup JSON 이 _src 에 …   붙여넣기 누락. 트랜잭션 미진입이라 안전
-- invalid input syntax for type json 붙여넣기 잘림 / $BACKUP$ 구분자 손상
-- STOP — backup 이후 drift 감지      백업 이후 데이터 변경. 백업을 다시 뜬다
-- ① DELETE FK 위반                   백업에 없는 자식 행 존재. drift gate 로직 점검
-- ② 23503                            부모(requests/profiles) 소실 또는 순서 오류
-- ② 23505                            ① 이 덜 지움. 백업 id 집합과 실제 불일치
-- ② not-null violation               백업 이후 컬럼 추가됨. 백업 재취득
-- V1 actual > expected               ① 이 덜 지움 또는 신규 행
-- V1 actual < expected               ② 가 덜 넣음
-- V2 mismatch <> 0                   ⑥ 실패. requests_snapshot 에 id 부재/캐스팅 실패
-- V2b = 0                            트리거 미발동. tgenabled / 031 적용 여부 확인
-- V3 > 0                             FK 상 불가능. DB 이상이므로 보고
-- ★ V4 false 인데 V1 통과            내용 불일치(created_at/nullable/본문/boolean).
--                                    V1/V2/V3 만으로는 못 잡던 구멍이 바로 이것이다
