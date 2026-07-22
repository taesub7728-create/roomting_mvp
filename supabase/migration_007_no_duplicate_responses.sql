-- 마이그레이션 007: 같은 공인중개사가 같은 요청서에 두 번 응답하지 못하도록 DB 차원에서 막음
alter table properties
  add constraint properties_request_realtor_unique unique (request_id, realtor_id);
