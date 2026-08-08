// Kakao Local API - coord2regioncode (좌표 -> 행정구역 역변환)
//
// 왜 필요한가:
//   station_districts.is_primary 의 판정 기준은 "역 대표 좌표가 속한 구"다(026 설계 의도).
//   공공데이터에는 시군구 "코드"가 들어 있지 않고 도로명주소는 텍스트라
//   districts.code(5자리)와 조인할 수 없다. 그래서 좌표에서 코드를 얻어야 한다.
//
// 범위:
//   시드 생성 1회성이다. 런타임(앱 번들)에서는 호출하지 않는다.
//   따라서 REST 키가 프론트엔드로 나갈 일이 없고, 쿼터/장애가 서비스에 영향을 주지 않는다.
//
// 키:
//   process.env.KAKAO_REST_API_KEY 하나만 읽는다. 저장소에 커밋하지 않는다(.env).
//   지도용 JS 키(VITE_KAKAO_MAP_API_KEY)와 다른 키다. 두 키 모두 32자 hex라
//   눈으로는 구분되지 않으므로, 잘못 넣으면 401/403 으로 드러나게 해 두었다.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheDir, kakao as kakaoConfig } from '../config.mjs'

const CACHE_FILE = path.join(cacheDir, 'coord2regioncode.json')

/**
 * REST 키 가드.
 * 키가 없으면 여기서 즉시 중단한다. 없는 채로 진행해 district 를 전부 null 로 채우면
 * 병합 그룹핑 키(정규화 역명 + primary district)가 무너져서 리포트 전체를 못 믿게 된다.
 */
export function requireKakaoRestKey() {
  const raw = process.env.KAKAO_REST_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''

  if (key === '') {
    throw new Error(
      [
        'KAKAO_REST_API_KEY 환경변수가 없습니다. 역 좌표를 시군구 코드로 바꿀 수 없어 중단합니다.',
        '',
        '  1) 카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 에서 "REST API 키"를 확인합니다.',
        '     지도용 JavaScript 키(VITE_KAKAO_MAP_API_KEY)와는 다른 키입니다.',
        '  2) 저장소 루트 .env 에 다음 형식으로 넣습니다(값은 커밋하지 않습니다):',
        '       KAKAO_REST_API_KEY=발급받은_REST_키',
        '  3) 다시 실행합니다:  npm run seed:stations',
        '',
        '  키 없이 파싱/병합 로직만 확인하려면:  npm run seed:stations -- --no-kakao',
        '  (그 경우 결과는 merge_report.dryrun.csv 로 나가며 검수용으로 쓸 수 없습니다.)',
      ].join('\n'),
    )
  }

  return key
}

function coordKey(lat, lng) {
  const p = kakaoConfig.coordPrecision
  return `${lat.toFixed(p)},${lng.toFixed(p)}`
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 좌표 -> 시군구 역변환기.
 *
 * 캐시를 쓰는 이유: 환승역은 노선 수만큼 같은 좌표가 반복되고, 실행을 여러 번 하게 된다.
 * 캐시는 .cache/ 에 있고 지워도 무방하다(다시 호출할 뿐이다).
 */
export async function createRegionResolver({ enabled = true } = {}) {
  const cache = new Map()
  const failures = [] // { lat, lng, key, status, reason }
  let cacheLoaded = false
  let apiCalls = 0
  let cacheHits = 0
  let sinceLastSave = 0

  if (enabled) {
    try {
      const raw = await readFile(CACHE_FILE, 'utf-8')
      for (const [k, v] of Object.entries(JSON.parse(raw))) {
        // 실패는 캐시하지 않지만, 옛 캐시 파일에 null 이 들어 있을 수 있다.
        // 그건 건너뛴다 - 실패를 캐시에서 되읽으면 이번 실행의 실패 목록에서 빠져
        // 리포트가 "실패 0건"으로 보이게 된다.
        if (v) cache.set(k, v)
      }
      cacheLoaded = true
    } catch {
      // 캐시 없음. 정상이다.
    }
  }

  const key = enabled ? requireKakaoRestKey() : null

  // 좌표 1건의 조회 결과.
  //   { ok: true,  region }                     성공
  //   { ok: false, status, reason }             그 좌표만 실패. 실행은 계속한다
  //   throw                                     실행 전체를 세울 사유(키/쿼터)
  async function fetchRegion(lat, lng) {
    const url = `${kakaoConfig.endpoint}?x=${lng}&y=${lat}&input_coord=WGS84`

    for (let attempt = 1; attempt <= kakaoConfig.maxRetries; attempt += 1) {
      const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          [
            `Kakao API가 인증을 거부했습니다 (HTTP ${res.status}).`,
            'KAKAO_REST_API_KEY 값이 REST API 키가 맞는지 확인하십시오.',
            '지도용 JavaScript 키를 넣으면 같은 32자 hex라 눈으로는 구분되지 않지만 여기서 거부됩니다.',
            '카카오 콘솔에서 해당 앱의 "카카오맵" 또는 Local API 사용 설정이 켜져 있는지도 함께 봅니다.',
          ].join('\n'),
        )
      }

      // 429(쿼터)/5xx 는 잠시 쉬고 재시도한다.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === kakaoConfig.maxRetries) {
          throw new Error(`Kakao API 응답 ${res.status} 이 ${attempt}회 연속 반복되어 중단합니다.`)
        }
        await sleep(kakaoConfig.delayMs * 10 * attempt)
        continue
      }

      // 400 등 그 밖의 오류는 좌표 하나의 문제다(잘못된 x/y 등).
      // 실행 전체를 세우지 않고 실패로 기록만 하고 넘어간다 - 300여 건짜리 실행을
      // 한 좌표 때문에 처음부터 다시 돌리는 것이 더 나쁘다.
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          reason: (await res.text()).replace(/\s+/g, ' ').slice(0, 200),
        }
      }

      const body = await res.json()
      const documents = body.documents ?? []

      // region_type 'B' = 법정동. code 10자리 중 앞 5자리가 시군구 코드이고
      // 이것이 districts.code 와 조인 가능한 값이다.
      // 'H'(행정동)를 쓰지 않는 이유: districts 는 행정표준코드 법정동코드 기반이다(024).
      const b = documents.find((d) => d.region_type === 'B')
      if (!b) {
        const types = documents.map((d) => d.region_type).join(',') || '없음'
        return {
          ok: false,
          status: res.status,
          reason: `법정동(region_type=B) 응답 없음. documents ${documents.length}건(region_type: ${types})`,
        }
      }

      return {
        ok: true,
        region: {
          districtCode: String(b.code).slice(0, 5),
          sidoName: b.region_1depth_name ?? null,
          districtName: b.region_2depth_name ?? null,
        },
      }
    }
    // 재시도 루프를 빠져나오는 경로는 위에서 전부 return/throw 된다.
    return { ok: false, status: null, reason: '재시도 루프 종료(도달하지 않아야 하는 경로)' }
  }

  async function persist() {
    if (!enabled) return
    await mkdir(cacheDir, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2), 'utf-8')
    sinceLastSave = 0
  }

  return {
    /** @returns {Promise<{districtCode,sidoName,districtName}|null>} */
    async resolve(lat, lng) {
      if (!enabled) return null
      const k = coordKey(lat, lng)
      if (cache.has(k)) {
        cacheHits += 1
        return cache.get(k)
      }

      let outcome
      try {
        outcome = await fetchRegion(lat, lng)
      } catch (err) {
        // 키/쿼터 문제로 실행을 세우더라도, 여기까지 받은 응답은 디스크에 남긴다.
        // 다시 돌릴 때 처음부터 호출하지 않기 위해서다.
        await persist()
        throw err
      }

      apiCalls += 1

      if (!outcome.ok) {
        // 실패는 캐시하지 않는다. 재실행 때 다시 시도되고 다시 보고되어야 한다.
        failures.push({ lat, lng, key: k, status: outcome.status, reason: outcome.reason })
        await sleep(kakaoConfig.delayMs)
        return null
      }

      cache.set(k, outcome.region)
      sinceLastSave += 1
      if (sinceLastSave >= kakaoConfig.autosaveEvery) await persist()

      await sleep(kakaoConfig.delayMs)
      return outcome.region
    },

    persist,

    /** 좌표 단위 실패 전체. { lat, lng, key, status, reason } */
    failures: () => failures,

    stats: () => ({
      apiCalls,
      cacheHits,
      cacheLoaded,
      cacheSize: cache.size,
      failureCount: failures.length,
    }),
  }
}
