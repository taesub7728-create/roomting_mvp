import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Landing from './pages/Landing/Landing'
import SignUp from './pages/SignUp/SignUp'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<SignUp />} />
          {/* 조건 요청서 작성, 지도 탐색 화면은 다음 단계에서 구현 예정 */}
          <Route path="/request" element={<ComingSoon />} />
          <Route path="/map" element={<ComingSoon />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
