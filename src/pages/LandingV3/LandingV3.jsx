import BottomTabBar from '../../components/BottomTabBar'
import LandingV3Header from './components/LandingV3Header'
import HeroV3 from './components/HeroV3'
import HeroFlowGraphic from './components/HeroFlowGraphic'
import RequestCTAV3 from './components/RequestCTAV3'
import BrowseCTAV3 from './components/BrowseCTAV3'
import HowItWorksV3 from './components/HowItWorksV3'
import MatchingDifferenceV3 from './components/MatchingDifferenceV3'
import RealtorCTAV3 from './components/RealtorCTAV3'
import FooterV3 from './components/FooterV3'
import './LandingV3.css'

// "Premium Marketplace" 브랜드 탐색 시안 (V1/V2와 완전히 별도 네임스페이스).
// /landing-v3 임시 라우트로만 접근 가능, 어디에도 링크 안 걸림. /는 계속 V1이 담당.
//
// v3-hero-text-col은 모바일에서는 display:contents로 그냥 평범하게 세로로 쌓이고
// (Hero → HeroFlowGraphic → CTA 순서, Stitch V3 시안과 동일한 순서),
// 데스크톱(1024px~)에서만 v3-hero-group이 그리드로 바뀌면서 그래픽이 우측 컬럼으로 분리된다
export default function LandingV3() {
  return (
    <div className="frame v3-frame">
      <div className="v3-hero-canvas">
        <LandingV3Header />
        <div className="v3-hero-group">
          <div className="v3-hero-text-col">
            <HeroV3 />
            <HeroFlowGraphic />
            <RequestCTAV3 />
            <BrowseCTAV3 />
          </div>
        </div>
      </div>
      <HowItWorksV3 />
      <MatchingDifferenceV3 />
      <RealtorCTAV3 />
      <FooterV3 />
      <BottomTabBar />
    </div>
  )
}
