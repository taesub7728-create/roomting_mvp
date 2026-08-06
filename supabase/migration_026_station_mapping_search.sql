-- 마이그레이션 026: station_districts / station_aliases + 검색 정규화 함수
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_025_stations_lines.sql까지 먼저 실행되어 있어야 함
--
-- 설계 의도:
--
--   [경계역] 역과 시군구를 단일 컬럼이 아니라 다대다로 연결한다.
--   MVP는 is_primary 하나로만 라우팅하고, 향후 경계역에 인접 구를 is_primary=false로
--   추가하면 라우팅 함수의 조건만 넓히면 된다. 스키마는 그대로다.
--   primary 판정 기준은 "역 대표 좌표가 속한 구"다. 출입구 기준이 아니라 좌표 기준인
--   이유는 자동 산출이 가능하고 재적재해도 같은 값이 나오기 때문이다.
--
--   [검색] pg_trgm을 쓰지 않는다. 근거 3가지:
--     1. 규모가 작다. 서울 ~300역 x 별칭 6~10 = 2,000~3,000행. 이 크기에서 GIN/trigram은
--        text_pattern_ops btree prefix 대비 이득이 없다.
--     2. pg_trgm의 한글 처리는 DB의 lc_ctype에 의존한다(C 로케일이면 한글 트라이그램이
--        비어버린다). 확인 없이 의존할 근거가 아니다.
--     3. 자동완성에는 prefix가 맞다. "홍" -> 홍대입구/홍제. trigram 유사도는 무관한
--        역을 섞어 넣는다.
--   오타 허용이 필요해지면 테이블 구조 변경 없이 GIN 인덱스만 추가하면 된다.
--
--   [초성] 별도 컬럼이 아니라 별칭 행(kind='chosung')으로 넣는다. 검색 경로가 하나로
--   통일되고, 자동생성임을 source로 추적할 수 있다.
--
-- 영향 범위:
--   변경 대상: 신규 테이블 2개 + 순수 함수 2개
--   영향 받는 기능: 없음
--   영향 없음: 기존 테이블 전부 / 기존 RLS / 인증 흐름
--   권한: 두 함수는 SECURITY DEFINER가 아니다(순수 문자열 변환). 권한과 무관하다.


-- ========================================
-- 1. station_districts (역 <-> 시군구 다대다)
-- ========================================
create table station_districts (
  station_id       uuid    not null references stations(id) on delete cascade,
  district_code    text    not null references districts(code),
  is_primary       boolean not null default false,
  routing_priority smallint not null default 100,   -- 낮을수록 우선. MVP에서는 미사용
  source           text,
  source_version   text,
  primary key (station_id, district_code)
);

-- 역당 primary는 정확히 하나
create unique index station_districts_one_primary
  on station_districts(station_id) where is_primary;

create index idx_station_districts_district on station_districts(district_code);


-- ========================================
-- 2. 검색 정규화 함수
--
--    저장 시점(alias_normalized)과 조회 시점(사용자 입력)에 반드시 같은 함수를 써야
--    하므로 SQL 함수로 둔다. 시드 스크립트도 이 함수를 통해 값을 만든다.
--
--    처리 순서:
--      (1) 전각 영숫자 -> 반각        '２호선' = '2호선'
--      (2) 가타카나 -> 히라가나        'ホンデ' = 'ほんで'
--      (3) 장음 부호 제거              'ホンデー' = 'ほんで'
--      (4) 소문자화                    'Hongdae' = 'hongdae'
--      (5) 공백/구두점 제거            'Konkuk Univ.' = 'konkukuniv'
--          ※ 하이픈은 브래킷 맨 끝에 두고 백슬래시를 쓰지 않는다.
--            POSIX 브래킷 안의 \- 는 동작이 모호해 하이픈이 안 지워질 수 있다.
--      (6) 끝의 역 접미사 제거         '홍대입구역' = '홍대입구', 'Hongdae Station' = 'hongdae'
--
--    (5)를 (6)보다 먼저 하는 이유: 'Hongdae Station'의 공백을 먼저 지워야
--    'hongdaestation'에서 'station' 접미사를 잡을 수 있다.
--
--    중국어 간체/번체는 변환 함수 대신 별칭 행 2개로 처리한다.
--    자동 변환은 예외가 많아 조용히 틀리는 반면, 데이터는 검수할 수 있다.
-- ========================================
create or replace function public.normalize_station_query(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select regexp_replace(
           regexp_replace(
             lower(
               translate(
                 translate(
                   translate(
                     p_text,
                     '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
                     '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
                   ),
                   'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ',
                   'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ'
                 ),
                 'ー・',   -- 장음 부호, 나카구로
                 ''
               )
             ),
             '[[:space:]''.,()·-]', '', 'g'       -- (5) 공백/구두점 제거
           ),
           '(역|station|駅|站)$', ''               -- (6) 끝의 역 접미사 제거
         );
$$;

comment on function public.normalize_station_query(text) is
  '역 검색 정규화. station_aliases.alias_normalized 생성과 사용자 입력 처리에 같이 쓴다. 한쪽만 바꾸면 검색이 조용히 깨진다.';


-- ========================================
-- 3. 한글 초성 추출 함수
--
--    순수 산술이라 확장이 필요 없다.
--    한글 음절 = 0xAC00(44032) + (초성index * 588) + (중성index * 28) + 종성index
--    따라서 초성index = (코드포인트 - 44032) / 588  (정수 나눗셈)
--    '홍대입구' -> 'ㅎㄷㅇㄱ'
--    한글이 아닌 문자는 그대로 둔다.
-- ========================================
create or replace function public.hangul_chosung(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select coalesce(
    string_agg(
      case
        when ascii(ch) between 44032 and 55203
          then substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
                      ((ascii(ch) - 44032) / 588) + 1, 1)
        else ch
      end,
      '' order by ord
    ), ''
  )
  from regexp_split_to_table(p_text, '') with ordinality as t(ch, ord);
$$;


-- ========================================
-- 4. station_aliases (검색 별칭)
--
--    kind:
--      official      - 데이터셋의 ko/en/ja/zh/한자 공식명 (자동 생성)
--      chosung       - 한글 초성 (자동 생성)
--      romanization  - 로마자 변형
--      short         - 축약어('홍대','건대','고터'). 데이터에 없어 사람이 넣는다
--      legacy        - 옛 역명, 운영기관별 표기 차이 (병합 과정에서 자동 수집)
--
--    source: 'dataset'(자동) | 'manual-reviewed'(사람이 넣고 검수함)
-- ========================================
create table station_aliases (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references stations(id) on delete cascade,
  alias            text not null,        -- 원문. 화면에 표시하지 않고 검수/디버깅용
  alias_normalized text not null,        -- normalize_station_query(alias) 결과
  lang             text,                 -- 'ko'|'en'|'ja'|'zh'|null(공통)
  kind             text not null,
  source           text not null default 'dataset',

  constraint station_aliases_kind_valid
    check (kind in ('official','chosung','romanization','short','legacy')),
  constraint station_aliases_source_valid
    check (source in ('dataset','manual-reviewed'))
);

-- prefix 매칭 전용 인덱스. alias_normalized LIKE '홍대%' 형태를 받는다.
-- text_pattern_ops를 쓰는 이유: DB collation이 C가 아닐 때 기본 btree는 LIKE prefix에
-- 쓰이지 않는다.
create index idx_station_aliases_prefix
  on station_aliases (alias_normalized text_pattern_ops);

create index idx_station_aliases_station on station_aliases(station_id);

-- 같은 역에 같은 정규화 값이 중복 적재되지 않도록
create unique index idx_station_aliases_unique
  on station_aliases (station_id, alias_normalized, coalesce(lang, ''));


-- ========================================
-- RLS: 검색 대상이므로 비로그인 포함 읽기 허용. 쓰기 정책 없음(시드 전용).
-- ========================================
alter table station_districts enable row level security;
alter table station_aliases enable row level security;

create policy "station_districts_select_all" on station_districts
  for select to authenticated, anon using (true);

create policy "station_aliases_select_all" on station_aliases
  for select to authenticated, anon using (true);


-- ========================================
-- 적용 후 확인 (시드 전이라 함수 동작 검증용)
--
-- 긴 역명 시험이 아니라 정규화 규칙별 대표 문자를 검증하는 것이 목적이다.
-- 전부 true여야 한다. 하나라도 false면 시드를 만들기 전에 고칠 것 -
-- 정규화가 틀린 채로 시드를 생성하면 별칭 전체를 다시 만들어야 한다.
-- ========================================
-- select public.normalize_station_query('강남역')             = '강남'             as t01_ko_suffix;
-- select public.normalize_station_query('뚝섬유원지')          = '뚝섬유원지'        as t02_no_suffix;
-- select public.normalize_station_query('디지털미디어시티')     = '디지털미디어시티'   as t03_long_ko;
-- select public.normalize_station_query('Digital Media City') = 'digitalmediacity' as t04_space_lower;
-- select public.normalize_station_query('Hongik Univ.')       = 'hongikuniv'       as t05_period;
-- select public.normalize_station_query('Hongdae Station')    = 'hongdae'          as t06_en_suffix;
-- select public.normalize_station_query('홍대입구역')          = '홍대입구'          as t07_ko_suffix2;
-- select public.normalize_station_query('Konkuk Univ.')       = 'konkukuniv'       as t08_period2;
-- select public.normalize_station_query('ホンデイック')         = 'ほんでいっく'       as t09_katakana;
-- select public.normalize_station_query('ホンデ入口駅')         = 'ほんで入口'         as t10_kana_hanja_suffix;
-- select public.normalize_station_query('ホンデー')            = 'ほんで'            as t11_chouon;
-- select public.normalize_station_query('弘大入口駅')          = '弘大入口'          as t12_hanja_suffix;
-- select public.normalize_station_query('２号線')              = '2号線'            as t13_fullwidth;
-- select public.normalize_station_query('２호선')              = '2호선'            as t14_fullwidth2;
-- select public.normalize_station_query('ㅎㄷ')                = 'ㅎㄷ'              as t15_chosung_passthru;
-- select public.normalize_station_query('ㅎㄷㅇㄱ')             = 'ㅎㄷㅇㄱ'           as t16_chosung_passthru2;
--
-- select public.hangul_chosung('강남')            = 'ㄱㄴ'            as t17;
-- select public.hangul_chosung('홍대입구')         = 'ㅎㄷㅇㄱ'         as t18;
-- select public.hangul_chosung('뚝섬유원지')       = 'ㄸㅅㅇㅇㅈ'       as t19;
-- select public.hangul_chosung('디지털미디어시티')  = 'ㄷㅈㅌㅁㄷㅇㅅㅌ'  as t20;
-- select public.hangul_chosung('Hongdae')         = 'Hongdae'        as t21_non_hangul_passthru;
--
-- ★ t15/t16이 중요하다. 초성 문자(ㅎ = U+314E)는 한글 "음절"이 아니라 호환 자모라
--   normalize_station_query가 건드리면 안 된다. 사용자가 'ㅎㄷ'을 입력했을 때 그대로
--   통과해야 station_aliases의 kind='chosung' 행과 prefix 매칭된다.


-- ========================================
-- 롤백
-- ========================================
-- drop table if exists station_aliases;
-- drop table if exists station_districts;
-- drop function if exists public.normalize_station_query(text);
-- drop function if exists public.hangul_chosung(text);
