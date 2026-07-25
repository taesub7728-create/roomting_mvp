// roomting-landing-v5.html 프로토타입의 4개국어 텍스트를 그대로 옮김
export const landingText = {
  ko: {
    heroTitle: '조건만 입력하면,\n부동산이 먼저 제안해요',
    cardRequestTitle: '내 조건에 맞는 방 받아보기',
    cardRequestDesc: '조건 입력하고 제안 받기',
    trustLine: '여러 공인중개사가 24시간 안에 답해요',
    login: '로그인', signup: '회원가입',
    mypage: '마이페이지',
    logout: '로그아웃',
    footerHelp: '도움이 필요하신가요?',
    footerContact: '고객센터 문의',
  },
  ja: {
    heroTitle: '条件を入力するだけで、\n不動産から先に提案が届きます',
    cardRequestTitle: '条件に合う部屋を提案してもらう',
    cardRequestDesc: '条件を入力して提案を受ける',
    trustLine: '複数のエージェントが24時間以内に返信します',
    login: 'ログイン', signup: '会員登録',
    mypage: 'マイページ',
    logout: 'ログアウト',
    footerHelp: 'お困りですか？',
    footerContact: 'お問い合わせ',
  },
  zh: {
    heroTitle: '只需输入条件，\n中介会主动向您提案',
    cardRequestTitle: '获取符合我条件的房间',
    cardRequestDesc: '输入条件并获取建议',
    trustLine: '多位经纪人会在24小时内回复您',
    login: '登录', signup: '注册',
    mypage: '我的页面',
    logout: '退出登录',
    footerHelp: '需要帮助？',
    footerContact: '联系客服',
  },
  en: {
    heroTitle: 'Set your criteria,\nand agents come to you',
    cardRequestTitle: 'Get matched rooms',
    cardRequestDesc: 'Set criteria, get proposals',
    trustLine: 'Multiple agents reply within 24 hours',
    login: 'Log in', signup: 'Sign up',
    mypage: 'My Page',
    logout: 'Log out',
    footerHelp: 'Need help?',
    footerContact: 'Contact support',
  },
}

export const langOptions = [
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'en', flag: '🌐', label: 'English' },
]
