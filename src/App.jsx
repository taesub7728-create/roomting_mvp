import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import SignUp from './pages/SignUp/SignUp'
import RequestWizard from './pages/RequestWizard/RequestWizard'
import RealtorDashboard from './pages/RealtorDashboard/RealtorDashboard'
import RealtorRespond from './pages/RealtorRespond/RealtorRespond'
import ResponseStatus from './pages/ResponseStatus/ResponseStatus'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/request" element={<RequestWizard />} />
          <Route path="/realtor" element={<RealtorDashboard />} />
          <Route path="/realtor/respond/:requestId" element={<RealtorRespond />} />
          <Route path="/requests/:requestId" element={<ResponseStatus />} />
          {/* 매물 상세 페이지, 채팅, 지도 탐색 화면은 다음 단계에서 구현 예정 */}
          <Route path="/coming-soon" element={<ComingSoon />} />
          <Route path="/chat/:propertyId" element={<ComingSoon />} />
          <Route path="/map" element={<ComingSoon />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
