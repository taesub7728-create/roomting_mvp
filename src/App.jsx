import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Landing from './pages/Landing/Landing'
import SignUp from './pages/SignUp/SignUp'
import RequestWizard from './pages/RequestWizard/RequestWizard'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/request" element={<RequestWizard />} />
          {/* 지도 탐색 화면은 다음 단계에서 구현 예정 */}
          <Route path="/map" element={<ComingSoon />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
