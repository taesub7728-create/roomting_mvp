// 온보딩 화면 텍스트. 언어별로 화면 수 자체가 다르므로(ko 2장, ja/zh/en 3장)
// screens 배열의 길이가 곧 그 언어의 온보딩 페이지 수다 - Onboarding.jsx는 이 배열을
// 그대로 순회할 뿐 화면 수를 따로 하드코딩하지 않는다.
//
// onboarding_3의 bubble_original(incoming1Original)은 "중개사가 보낸 한국어 원문"이라
// ja/zh/en 모두 동일한 한국어 문장으로 통일한다(원본 JSON 스펙의 ja/zh 값 오류를 여기서 수정).
export const onboardingText = {
  ko: {
    skip: '건너뛰기',
    stepLabel: (current, total) => `${total}단계 중 ${current}단계`,
    screens: [
      {
        id: 'onboarding_1',
        headline: '조건을 보내면,\n부동산이 찾아와요',
        sub: '지역, 예산, 방 종류만 알려주세요',
        cta: '다음',
        skipVisible: true,
        mockup: {
          type: 'request',
          cardTitle: '내 요청서',
          fields: [
            { icon: 'map-pin', label: '지역', value: '홍대입구' },
            { icon: 'wallet', label: '예산', value: '월세 70만원 이하' },
            { icon: 'home', label: '방 종류', value: '원룸' },
            { icon: 'calendar', label: '입주일', value: '8월 초' },
          ],
        },
      },
      {
        id: 'onboarding_2',
        headline: '여러 중개사가\n각자 매물을 보내요',
        sub: '한 번의 요청으로 여러 제안을 받아보세요',
        cta: '시작하기',
        skipVisible: false,
        mockup: {
          type: 'proposals',
          cards: [
            { name: 'A부동산', priceSummary: '보증금 500 · 월세 45만원', meta: '홍대입구역 · 도보 5분', badge: '새 제안' },
            { name: 'B부동산', priceSummary: '보증금 1000 · 월세 60만원', meta: '신촌역 · 도보 3분', badge: '새 제안' },
            { name: 'C부동산', priceSummary: '보증금 300 · 월세 40만원', meta: '상수역 · 도보 7분', badge: '새 제안' },
          ],
        },
      },
    ],
  },
  ja: {
    skip: 'スキップ',
    stepLabel: (current, total) => `ステップ${current}/${total}`,
    screens: [
      {
        id: 'onboarding_1',
        headline: '条件を送ると、\n不動産から提案が届きます',
        sub: 'エリア・予算・部屋タイプだけ教えてください',
        cta: '次へ',
        skipVisible: true,
        mockup: {
          type: 'request',
          cardTitle: 'あなたの条件',
          fields: [
            { icon: 'map-pin', label: 'エリア', value: '弘大入口' },
            { icon: 'wallet', label: '予算', value: '家賃70万ウォン以下' },
            { icon: 'home', label: '部屋タイプ', value: 'ワンルーム' },
            { icon: 'calendar', label: '入居日', value: '8月初旬' },
          ],
        },
      },
      {
        id: 'onboarding_2',
        headline: '複数の仲介会社から\nそれぞれ提案が届きます',
        sub: '1回のリクエストで複数の提案を受け取れます',
        cta: '次へ',
        skipVisible: true,
        mockup: {
          type: 'proposals',
          cards: [
            { name: 'A不動産', priceSummary: '保証金500・家賃45万ウォン', meta: '弘大入口駅・徒歩5分', badge: '新着提案' },
            { name: 'B不動産', priceSummary: '保証金1000・家賃60万ウォン', meta: '新村駅・徒歩3分', badge: '新着提案' },
            { name: 'C不動産', priceSummary: '保証金300・家賃40万ウォン', meta: '上水駅・徒歩7分', badge: '新着提案' },
          ],
        },
      },
      {
        id: 'onboarding_3',
        headline: '韓国語がわからなくても\n会話できます',
        sub: 'メッセージは自動で翻訳されます',
        cta: 'はじめる',
        skipVisible: false,
        mockup: {
          type: 'chat',
          header: '翻訳チャット',
          translatedLabel: '韓国語から翻訳',
          incoming1Translated: '明日午後3時に内見できます',
          incoming1Original: '내일 오후 3시에 방 보실 수 있어요',
          outgoing1: 'はい、お願いします！',
          incoming2: 'では、場所をご案内します',
        },
      },
    ],
  },
  zh: {
    skip: '跳过',
    stepLabel: (current, total) => `第${current}步，共${total}步`,
    screens: [
      {
        id: 'onboarding_1',
        headline: '提交条件后，\n房源会主动来找你',
        sub: '只需告诉我们区域、预算和房型',
        cta: '下一步',
        skipVisible: true,
        mockup: {
          type: 'request',
          cardTitle: '你的需求',
          fields: [
            { icon: 'map-pin', label: '区域', value: '弘大入口' },
            { icon: 'wallet', label: '预算', value: '月租70万韩元以下' },
            { icon: 'home', label: '房型', value: '单间' },
            { icon: 'calendar', label: '入住日', value: '8月初' },
          ],
        },
      },
      {
        id: 'onboarding_2',
        headline: '多家中介会分别\n给你发送房源',
        sub: '一次提交请求，就能收到多个提案',
        cta: '下一步',
        skipVisible: true,
        mockup: {
          type: 'proposals',
          cards: [
            { name: 'A中介', priceSummary: '保证金500 · 月租45万韩元', meta: '弘大入口站 · 步行5分钟', badge: '新提案' },
            { name: 'B中介', priceSummary: '保证金1000 · 月租60万韩元', meta: '新村站 · 步行3分钟', badge: '新提案' },
            { name: 'C中介', priceSummary: '保证金300 · 月租40万韩元', meta: '上水站 · 步行7分钟', badge: '新提案' },
          ],
        },
      },
      {
        id: 'onboarding_3',
        headline: '不会韩语，\n也能轻松沟通',
        sub: '消息会自动翻译',
        cta: '开始使用',
        skipVisible: false,
        mockup: {
          type: 'chat',
          header: '翻译聊天',
          translatedLabel: '由韩语翻译',
          incoming1Translated: '明天下午3点可以看房',
          incoming1Original: '내일 오후 3시에 방 보실 수 있어요',
          outgoing1: '好的，可以！',
          incoming2: '那我把位置发给你',
        },
      },
    ],
  },
  en: {
    skip: 'Skip',
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    screens: [
      {
        id: 'onboarding_1',
        headline: 'Tell us what you need.\nHomes come to you',
        sub: 'Just tell us your area, budget, and room type',
        cta: 'Next',
        skipVisible: true,
        mockup: {
          type: 'request',
          cardTitle: 'Your request',
          fields: [
            { icon: 'map-pin', label: 'Area', value: 'Hongdae' },
            { icon: 'wallet', label: 'Budget', value: 'Up to ₩700,000 rent' },
            { icon: 'home', label: 'Room type', value: 'Studio' },
            { icon: 'calendar', label: 'Move-in', value: 'Early August' },
          ],
        },
      },
      {
        id: 'onboarding_2',
        headline: 'Multiple agents send\nlistings of their own',
        sub: 'One request brings you multiple proposals',
        cta: 'Next',
        skipVisible: true,
        mockup: {
          type: 'proposals',
          cards: [
            { name: 'Agency A', priceSummary: '₩500 deposit · ₩450,000 rent', meta: 'Hongdae Stn · 5 min walk', badge: 'New' },
            { name: 'Agency B', priceSummary: '₩1,000 deposit · ₩600,000 rent', meta: 'Sinchon Stn · 3 min walk', badge: 'New' },
            { name: 'Agency C', priceSummary: '₩300 deposit · ₩400,000 rent', meta: 'Sangsu Stn · 7 min walk', badge: 'New' },
          ],
        },
      },
      {
        id: 'onboarding_3',
        headline: "You can chat even\nif you don't speak Korean",
        sub: 'Messages are translated automatically',
        cta: 'Get started',
        skipVisible: false,
        mockup: {
          type: 'chat',
          header: 'Translated chat',
          translatedLabel: 'Translated from Korean',
          incoming1Translated: 'You can view the room tomorrow at 3 PM',
          incoming1Original: '내일 오후 3시에 방 보실 수 있어요',
          outgoing1: 'Yes, that works!',
          incoming2: "I'll send you the location then",
        },
      },
    ],
  },
}
