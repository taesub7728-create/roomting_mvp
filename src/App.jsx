import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import PartnerLogin from './pages/PartnerLogin/PartnerLogin'
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
          <Route path="/login" element={<Login />} />
          <Route path="/partner/login" element={<PartnerLogin />} />
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
