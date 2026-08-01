import { ClipboardCheck, Mail, CheckCircle2, Sparkles } from 'lucide-react'
import './HeroFlowGraphic.css'

// "내 조건" 카드 하나에서 여러 제안 배지로 뻗어나가는 흐름을 순수 SVG/CSS로 표현.
// 매물 사진/가격/주소 등 리스팅 요소는 전혀 쓰지 않는다 - "여러 응답이 도착했다"는
// 개념만 전달하는 추상 그래픽 (Stitch V3 시안의 시각 언어를 그대로 재현, 새 이미지 에셋 없음)
const NODES = [
  { Icon: Mail, label: '제안 도착', style: { top: '8%', left: '6%' } },
  { Icon: Sparkles, label: '매칭됨', style: { top: '4%', right: '6%' } },
  { Icon: CheckCircle2, label: '제안 도착', style: { bottom: '6%', left: '4%' } },
  { Icon: Mail, label: '매칭됨', style: { bottom: '2%', right: '10%' } },
]

const PATHS = [
  'M50,50 C38,35 28,28 22,20',
  'M50,50 C62,35 72,28 80,16',
  'M50,50 C38,65 26,72 20,84',
  'M50,50 C62,65 74,72 80,90',
]

export default function HeroFlowGraphic() {
  return (
    <div className="hero-flow-graphic" aria-hidden="true">
      <svg className="hero-flow-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="v3-flow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--coral)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {PATHS.map((d) => (
          <path key={d} d={d} fill="none" stroke="url(#v3-flow-grad)" strokeWidth="0.8" />
        ))}
      </svg>

      <div className="hero-flow-center">
        <ClipboardCheck size={18} strokeWidth={2.25} />
        <span>내 조건</span>
      </div>

      {NODES.map(({ Icon, label, style }, i) => (
        <div className="hero-flow-node" style={style} key={i}>
          <Icon size={13} strokeWidth={2.25} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
