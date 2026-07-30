import BottomTabBar from '../../components/BottomTabBar'
import LandingHeader from './components/LandingHeader'
import HeroSection from './components/HeroSection'
import RequestCTA from './components/RequestCTA'
import BrowseCTA from './components/BrowseCTA'
import HowItWorks from './components/HowItWorks'
import WhyRoomting from './components/WhyRoomting'
import RealtorCTA from './components/RealtorCTA'
import Footer from './components/Footer'
import logoMark from '../../assets/roomting-symbol.svg'
import './Landing.css'

// 공개 허브 역할의 Landing. 섹션 순서/카피 변경은 아래 조합과 translations.js만 건드리면 됨.
//
// hero-canvas: 헤더+히어로+CTA 구간에만 은은한 그라데이션을 적용하는 시각적 구역 경계.
// hero-group: 모바일에서는 그냥 세로로 쌓이고, 데스크톱(1024px~)에서만 좌(텍스트)/우(그래픽) 2컬럼
// grid로 바뀐다 - hero-graphic은 매물/지도 스크린샷이 아니라 브랜드 심볼만 사용
// (검색·탐색 서비스처럼 보이지 않게 하려는 의도적 선택, roomting-design-system.md 0번 참고)
export default function Landing() {
  return (
    <div className="frame landing-frame">
      <div className="hero-canvas">
        <LandingHeader />
        <div className="hero-group">
          <div className="hero-text-col">
            <HeroSection />
            <RequestCTA />
            <BrowseCTA />
          </div>
          <div className="hero-graphic" aria-hidden="true">
            <img src={logoMark} alt="" />
          </div>
        </div>
      </div>
      <HowItWorks />
      <WhyRoomting />
      <RealtorCTA />
      <Footer />
      <BottomTabBar />
    </div>
  )
}
