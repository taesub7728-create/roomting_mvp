import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Landing from './pages/Landing/Landing'
import SignUp from './pages/SignUp/SignUp'
import SignUpChoice from './pages/SignUp/SignUpChoice'
import RealtorSignUp from './pages/RealtorSignUp/RealtorSignUp'
import RequestWizard from './pages/RequestWizard/RequestWizard'
import RealtorDashboard from './pages/RealtorDashboard/RealtorDashboard'
import RealtorRespond from './pages/RealtorRespond/RealtorRespond'
import ResponseStatus from './pages/ResponseStatus/ResponseStatus'
import Chat from './pages/Chat/Chat'
import MyPage from './pages/MyPage/MyPage'
import MapExplore from './pages/MapExplore/MapExplore'
import AdminDashboard from './pages/AdminDashboard/AdminDashboard'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* 가입/로그인 통합 진입점으로 리다이렉트 (구 URL 대비) */}
          <Route path="/login" element={<Navigate to="/signup/customer" replace />} />
          <Route path="/partner/login" element={<Navigate to="/signup/realtor" replace />} />
          <Route path="/signup" element={<SignUpChoice />} />
          <Route path="/signup/customer" element={<SignUp />} />
          <Route path="/signup/realtor" element={<RealtorSignUp />} />
          <Route path="/request" element={<RequestWizard />} />
          <Route path="/realtor" element={<RealtorDashboard />} />
          <Route path="/realtor/respond/:requestId" element={<RealtorRespond />} />
          <Route path="/requests/:requestId" element={<ResponseStatus />} />
          <Route path="/mypage" element={<MyPage />} />
          {/* 매물 상세 페이지는 다음 단계에서 구현 예정 */}
          <Route path="/coming-soon" element={<ComingSoon />} />
          <Route path="/chat/:propertyId" element={<Chat />} />
          <Route path="/map" element={<MapExplore />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
