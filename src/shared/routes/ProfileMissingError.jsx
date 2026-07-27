// user(인증 세션)는 있는데 profiles 테이블에서 본인 행을 못 찾은 비정상 상태.
// (정상 흐름에서는 handle_new_user 트리거가 가입 즉시 만들어주므로 발생하지 않아야 함)
// 로그인 페이지로 보내면 "로그인은 이미 했는데 로그인 화면이 또 나오는" 혼란을 주므로 별도 안내로 처리.
export default function ProfileMissingError() {
  return (
    <div className="frame">
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>계정 정보를 불러오지 못했어요</p>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>잠시 후 다시 시도해주세요. 문제가 계속되면 고객센터로 문의해주세요.</p>
      </div>
    </div>
  )
}
