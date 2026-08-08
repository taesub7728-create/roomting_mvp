// 사람이 검수하여 확정한 병합 판정. git 추적되는 source-of-truth다 (output/data/.cache 아님).
//
// ★ 이건 자동 알고리즘의 예외 규칙이 아니다.
//   evaluatePair()/union-find(merge.mjs)의 자동 판정은 그대로 수행되고, 그 결과가 나온 뒤에만
//   이 표가 candidate group 단위로 최종 partition 을 덮어쓴다. 특정 역명으로 자동 규칙 자체를
//   바꾸는 코드는 여전히 금지다.
//
// 스키마: { reviewId, candidateName, fingerprint, verdict, note, decidedAt, partition? }
//   reviewId      candidate group 식별자. RV-xxxxxxxx (lib/review-id.mjs, normalize(main_name) 해시)
//   candidateName 사람이 읽기 위한 라벨. matching 에는 쓰지 않는다 - reviewId 만 쓴다
//   fingerprint   판정 시점 그 그룹의 내용 스냅샷 해시 (lib/fingerprint.mjs groupFingerprint()).
//                 npm run seed:stations:inventory 로 재생성한 manual_review_inventory.csv/md 의
//                 값을 그대로 옮겨 적는다. 임의로 만들어 넣지 않는다 - 안전장치가 무의미해진다.
//   verdict       CONFIRMED_MERGE | CONFIRMED_SPLIT | MIXED
//                   - CONFIRMED_MERGE: 그룹의 모든 source row 를 하나의 station 으로 확정
//                   - CONFIRMED_SPLIT: 판정 당시의 automatic partition 을 그대로 최종 승인
//                                      (partition 필드를 쓰지 않는다 - "지금 자동 결과"가 아니라
//                                       "그때 승인한 automatic partition"이며, fingerprint 에
//                                       그 partition 서명이 포함되어 있어 어긋나면 stale 로 걸린다)
//                   - MIXED: 3개 이상 row 중 일부만 합친다. partition 필수
//   note          근거. 20자 초과 필수 (빈 근거로 등록 불가 - lib/override-schema.mjs 가 검증)
//   decidedAt     YYYY-MM-DD
//   partition     MIXED 전용. sourceRowKey(문자열) 배열의 배열. 그룹의 모든 row 를 정확히 1번씩
//                 덮어야 한다. sourceRowKey 는 inventory 의 source_row_key 열/컬럼에서 그대로 옮긴다.
//
// 재판정 경로(fingerprint 가 어긋났을 때) - README.md 「override 가 stale/unused 로 걸렸을 때」 참고.
// --ignore-stale 같은 우회 옵션은 의도적으로 만들지 않는다.

// ────────────────────────────────────────────────────────────────
// 2026-08-08 1차 판정: 23개 candidate group (npm run seed:stations:inventory 재생성 결과)
//   CONFIRMED_SPLIT 1건 + CONFIRMED_MERGE 22건 + MIXED 0건.
//   fingerprint 는 전부 그날 실행한 manual_review_inventory.csv 의 실제 값이다(임의 생성 아님).
// ────────────────────────────────────────────────────────────────

const DECIDED_AT = '2026-08-08'

// 22건 MERGE 공통 근거: 전부 개찰구 안에서 환승 가능한 물리적 단일 환승역이다.
// hold 로 남은 이유는 표준데이터의 환승 정보 결손(환승역구분 N / 환승노선번호 공란·편도 기재)이지
// 실제로 역이 갈라져 있어서가 아니다.
const MERGE_COMMON = '개찰구 안에서 환승 가능한 물리적 단일 환승역. hold 원인은 원본 데이터의 환승 정보 결손' +
  '(환승역구분 N 또는 환승노선번호 공란·편도 기재)이지 실제 분리가 아님.'

// 도봉산·창동·석계·온수·종로3가: 1호선이 경원선/경인선 등 별도 source identity 로 쪼개진
// "정책적 hold"(line-identity.mjs 의 1호선 계열 family 미도입 결정에 따른 결과)다.
// intentional_identity_separation cause 로 표시된다. 승객 관점으로는 명백한 단일 환승역이다.
const POLICY_SEPARATED_NOTE = ' 1호선이 경원선/경인선 등 별도 source identity 로 쪼개져 정책적으로 hold 된 건' +
  '(line-identity.mjs 1호선 계열 family 미도입). 물리적으로는 명백한 단일 환승역.'

/** @type {Array<{reviewId: string, candidateName: string, fingerprint: string, verdict: string, note: string, decidedAt: string, partition?: string[][]}>} */
export const manualOverrides = [
  {
    reviewId: 'RV-a91b0e49',
    candidateName: '신촌',
    fingerprint: 'fp_b4f7070de1d6734d',
    verdict: 'CONFIRMED_SPLIT',
    note: '2호선 신촌역과 경의중앙선 신촌역은 701m 떨어진 별개 역. 개찰구를 나와 지상 도보 이동이 ' +
      '필요하고 환승 통로가 없다. 판정 당시 automatic partition(2개 cluster)을 그대로 최종 승인한다.',
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-7939e47f',
    candidateName: '종로3가',
    fingerprint: 'fp_b5fec3958d17b78f',
    verdict: 'CONFIRMED_MERGE',
    note: `1·3·5호선. ${MERGE_COMMON}${POLICY_SEPARATED_NOTE}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-bac68788',
    candidateName: '신설동',
    fingerprint: 'fp_1abaae2fe80dc382',
    verdict: 'CONFIRMED_MERGE',
    note: `1·2호선(성수지선)·우이신설선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-1897605b',
    candidateName: '김포공항',
    fingerprint: 'fp_8ac7b676123bd928',
    verdict: 'CONFIRMED_MERGE',
    note: `5·9호선·공항철도·서해선·김포골드라인. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-1c101d1f',
    candidateName: '공덕',
    fingerprint: 'fp_3e9b641ea0d9538b',
    verdict: 'CONFIRMED_MERGE',
    note: `5·6호선·공항철도·경의중앙선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-01c72fd1',
    candidateName: '신내',
    fingerprint: 'fp_4013d1eaf7893979',
    verdict: 'CONFIRMED_MERGE',
    note: `6호선·경춘선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-f9d22839',
    candidateName: '신림',
    fingerprint: 'fp_3a70afb1e7d229d1',
    verdict: 'CONFIRMED_MERGE',
    note: `2호선·신림선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-109e8208',
    candidateName: '강남',
    fingerprint: 'fp_4992f780448af51b',
    verdict: 'CONFIRMED_MERGE',
    note: `2호선·신분당선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-9c5fd97a',
    candidateName: '도봉산',
    fingerprint: 'fp_ed6147d37b04d454',
    verdict: 'CONFIRMED_MERGE',
    note: `1호선·7호선. ${MERGE_COMMON}${POLICY_SEPARATED_NOTE}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-31b4e4a3',
    candidateName: '창동',
    fingerprint: 'fp_4247bc95ad3ff664',
    verdict: 'CONFIRMED_MERGE',
    note: `1호선·4호선. ${MERGE_COMMON}${POLICY_SEPARATED_NOTE}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-c23c23a5',
    candidateName: '올림픽공원',
    fingerprint: 'fp_61ddac78ae467d32',
    verdict: 'CONFIRMED_MERGE',
    note: `5·9호선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-0916ec69',
    candidateName: '신사',
    fingerprint: 'fp_9f4cf25bbd4be4e3',
    verdict: 'CONFIRMED_MERGE',
    note: `3호선·신분당선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-f0953311',
    candidateName: '성신여대입구',
    fingerprint: 'fp_6b406ba6d7c61895',
    verdict: 'CONFIRMED_MERGE',
    note: `4호선·우이신설선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-b933ce4b',
    candidateName: '보라매',
    fingerprint: 'fp_4a78a816fe25e1f4',
    verdict: 'CONFIRMED_MERGE',
    note: `7호선·신림선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-07230d24',
    candidateName: '석계',
    fingerprint: 'fp_23d8b2395cd842b8',
    verdict: 'CONFIRMED_MERGE',
    note: `1호선·6호선. ${MERGE_COMMON}${POLICY_SEPARATED_NOTE}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-24e08948',
    candidateName: '광운대역',
    fingerprint: 'fp_b54b6da29962d0f6',
    verdict: 'CONFIRMED_MERGE',
    note: '1호선·경춘선. ' + MERGE_COMMON +
      ' 경의중앙선 행은 여객 운행이 없는 선로이나 물리적으로 같은 역사(40m) - 세 행을 전부 하나로 합친다. ' +
      '노선 표시 단계에서 경의중앙선 행을 어떻게 다룰지는 별도 검토가 필요하며 TODO_PHASE2.md 에 기록한다.',
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-3fba854c',
    candidateName: '석촌',
    fingerprint: 'fp_231f693ae607265e',
    verdict: 'CONFIRMED_MERGE',
    note: `8·9호선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-dde34b81',
    candidateName: '보문',
    fingerprint: 'fp_e86dd63d7b11d693',
    verdict: 'CONFIRMED_MERGE',
    note: `6호선·우이신설선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-55e2b39d',
    candidateName: '온수',
    fingerprint: 'fp_7978b9b68558abf7',
    verdict: 'CONFIRMED_MERGE',
    note: `1호선·7호선. ${MERGE_COMMON}${POLICY_SEPARATED_NOTE}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-f48d73b0',
    candidateName: '양재',
    fingerprint: 'fp_0c37341ce0ff3425',
    verdict: 'CONFIRMED_MERGE',
    note: `3호선·신분당선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-efae0bc7',
    candidateName: '신논현',
    fingerprint: 'fp_653c4922116c81cf',
    verdict: 'CONFIRMED_MERGE',
    note: `9호선·신분당선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-35c5062d',
    candidateName: '논현',
    fingerprint: 'fp_ca9c1d428ff93939',
    verdict: 'CONFIRMED_MERGE',
    note: `7호선·신분당선. ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
  {
    reviewId: 'RV-073ce0d7',
    candidateName: '중랑역',
    fingerprint: 'fp_4e035dd16fc59fa0',
    verdict: 'CONFIRMED_MERGE',
    note: `경의중앙선·경춘선, 거리 0m(동일 승강장). ${MERGE_COMMON}`,
    decidedAt: DECIDED_AT,
  },
]
