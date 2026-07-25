import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Splash from './components/Splash'
import CustomerRouteGuard from './components/CustomerRouteGuard'
import Landing from './pages/Landing/Landing'
import LoginChoice from './pages/Login/LoginChoice'
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
import PropertyDetail from './pages/PropertyDetail/PropertyDetail'
import AdminDashboard from './pages/AdminDashboard/AdminDashboard'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <LanguageProvider>
      <BrowserRouter>
        {showSplash && <Splash onFinish={() => setShowSplash(false)} />}
        <Routes>
          {/* 고객용 화면 묶음: admin 계정이 URL 직접 입력/뒤로가기 등으로 들어오면 즉시 /admin으로 되돌림 */}
          <Route element={<CustomerRouteGuard />}>
            <Route path="/" element={<Landing />} />
            <Route path="/request" element={<RequestWizard />} />
            <Route path="/requests/:requestId" element={<ResponseStatus />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/chat/:propertyId" element={<Chat />} />
            <Route path="/map" element={<MapExplore />} />
            <Route path="/property/:propertyId" element={<PropertyDetail />} />
          </Route>

          {/* 로그인 전용 진입점 - 회원가입(/signup) 흐름과 분리 */}
          <Route path="/login" element={<LoginChoice />} />
          <Route path="/login/customer" element={<SignUp mode="login" />} />
          <Route path="/login/realtor" element={<RealtorSignUp initialMode="login" />} />
          {/* 구 URL 대비 */}
          <Route path="/partner/login" element={<Navigate to="/login/realtor" replace />} />

          <Route path="/signup" element={<SignUpChoice />} />
          <Route path="/signup/customer" element={<SignUp />} />
          <Route path="/signup/realtor" element={<RealtorSignUp />} />
          <Route path="/realtor" element={<RealtorDashboard />} />
          <Route path="/realtor/respond/:requestId" element={<RealtorRespond />} />
          <Route path="/coming-soon" element={<ComingSoon />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
