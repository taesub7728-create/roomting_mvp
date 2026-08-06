-- 마이그레이션 032: requests 최종 제약 (역 선택 필수 + extra_note 길이)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_031_multi_property_response.sql까지 먼저 실행되어 있어야 함
--       ★ 그리고 아래 두 가지가 프론트에 이미 배포되어 있어야 한다:
--         (1) LocationStep 자동완성 UI - station_id를 실제로 저장하고 있을 것
--         (2) extra_note maxLength=300 + 글자 수 카운터
--
-- ============================================================================
-- 왜 이 두 CHECK를 027이 아니라 여기서 거는가
-- ============================================================================
--   NOT VALID는 기존 행 검사만 건너뛰고 신규 INSERT/UPDATE는 그대로 막는다.
--   027 시점에 completeness CHECK를 걸었다면, LocationStep UI가 배포되기 전까지
--   station_id 없는 요청서가 들어와 모든 신규 제출이 CHECK 위반으로 실패했을 것이다.
--   extra_note 길이도 마찬가지로 UI가 먼저 제한을 걸어야 사용자가 입력 중에 알 수 있다.
--
--   따라서 "폼이 새 규칙을 따르기 시작한 뒤에 거는 제약"만 이 파일에 모았다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: requests CHECK 제약 2개
--   영향 받는 기능: 요청서 제출 - UI가 이미 값을 채우고 길이를 제한하므로 체감 변화 없음
--   영향 없음: 조회 경로 전부 / RLS 전부 / 중개사 라우팅 / 채팅
--   개인정보: extra_note 길이 제한은 경감 조치다(아래 참고)


-- ========================================
-- 1. 역 선택 필수
--
--    027의 fill_request_location() 트리거는 station_id가 null이면 통과시키고
--    파생 컬럼(district_code/lat/lng)만 비운다. 그 완화는 UI 배포 전까지의 임시
--    조치였고, 이제 여기서 닫는다.
--
--    이 CHECK가 걸린 뒤에는 station_id 없는 요청서를 만들 수 없고, 따라서
--    district_code가 반드시 채워지므로 라우팅에서 누락되는 요청서가 생기지 않는다.
--    (station_id 없는 요청서는 어떤 중개사에게도 보이지 않는다 = 고객이 응답을 못 받는다)
-- ========================================
alter table requests
  add constraint requests_station_location_complete
  check (
    location_type <> 'station'
    or (station_id is not null and district_code is not null)
  )
  not valid;

-- 백필이 끝난 뒤 아래를 실행해 기존 행까지 검증한다.
-- 실행 전 위반 행이 0인지 먼저 확인할 것:
--   select id, status, region_text is not null as has_text
--   from requests
--   where location_type = 'station'
--     and (station_id is null or district_code is null);
--
--   -> 0행이면:
--      alter table requests validate constraint requests_station_location_complete;
--
--   -> 행이 남아 있고 전부 status='closed'라면 그대로 두고 VALIDATE를 생략해도 된다.
--      라우팅 대상이 아니라 피해가 없다. 다만 NOT VALID 상태로 남는다는 것을 기록할 것.
--      status='open'인 행이 남아 있으면 그 요청서는 아무에게도 보이지 않으므로
--      개별 판단이 필요하다(고객에게 재작성 안내 등).


-- ========================================
-- 2. extra_note 길이 제한 300자
--
--    ★ 이것은 경감 조치이지 개인정보 보호의 해결이 아니다.
--
--    300자 + 연락처 패턴 경고 + 안내 문구는 노출 "가능성"을 줄일 뿐, 자유 입력인 이상
--    개인정보가 중개사에게 전달될 가능성은 남는다. 중개사가 매물을 고르려면 목록에서
--    내용을 봐야 하므로 미리보기 축약(목록 일부/상세 전체)은 채택하지 않았다.
--    실제 유출이 관측되면 (a) 응답 전 마스킹 (b) 구조화 입력 전환을 재검토한다.
--    "보호 완료"로 취급하지 말 것.
--
--    300자 근거: 요청 조건 서술은 2~3문장이면 충분하다("햇빛 잘 드는 곳이면 좋겠어요.
--    반려묘가 있어요." = 약 30자). 길수록 사연이 늘고 개인정보가 섞일 확률이 오른다.
--    현재는 제한이 전혀 없다(text 무제한).
--
--    프론트가 함께 해야 하는 것:
--      - maxLength={300} + 실시간 카운터 "120 / 300"
--      - detectContactInfo.js 순수 함수로 패턴 경고 (차단 아님)
--          휴대폰  01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}
--          유선    0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}
--          이메일  [\w.+-]+@[\w-]+\.[\w.]{2,}
--          카카오  카톡|카카오|kakao|katalk
--          LINE    line\s*(id|아이디)|ライン
--          WeChat  wechat|위챗|微信
--        LINE/WeChat을 넣은 이유: 주 고객이 일본/중화권이라 카카오만 막으면
--        실제로 가장 많이 쓰일 채널을 놓친다
--      - 안내 문구 4개 언어 (연락처는 채팅에서 안전하게 주고받을 수 있다는 대안 제시)
-- ========================================
alter table requests
  add constraint requests_extra_note_length
  check (extra_note is null or char_length(extra_note) <= 300)
  not valid;

-- 기존 행 위반 여부 확인 후 VALIDATE
--   select count(*) from requests where char_length(extra_note) > 300;
--   -> 0이면:
--      alter table requests validate constraint requests_extra_note_length;


-- ========================================
-- 롤백
-- ========================================
-- alter table requests drop constraint if exists requests_extra_note_length;
-- alter table requests drop constraint if exists requests_station_location_complete;
