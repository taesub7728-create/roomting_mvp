import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 시군구(districts) 조회. 현재는 admin 승인 화면의 영업지역 선택에서만 쓴다.
//
// migration_024 의 districts_select_all 정책이 anon/authenticated 모두에게 SELECT 를
// 허용하므로 별도 권한 처리가 필요 없다. 영업지역을 실제로 "부여"하는 권한은
// realtor_service_areas 의 admin 전용 정책과 approve_realtor_application() 이 지킨다.

// 서울특별시 시도 코드. districts.sido_code 가 '11' 인 행이 서울 25개 자치구다.
export const SEOUL_SIDO_CODE = '11'

/**
 * 전체 시군구를 한 번에 읽는다(256행).
 *
 * 페이지네이션이나 서버 검색을 두지 않는 이유: 256행은 한 번에 받아도 부담이 없고,
 * admin 이 "서울 25개 중 고르기"와 "전국에서 찾기"를 오가는 화면이라 클라이언트에서
 * 필터링하는 편이 응답이 즉각적이다. 행 수가 크게 늘면 그때 서버 검색으로 옮긴다.
 */
export async function listDistricts() {
  const { data, error } = await supabase
    .from('districts')
    .select('code, sido_code, name_ko')
    .order('code')

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
