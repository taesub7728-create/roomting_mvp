import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './shared/auth/AuthProvider'
import CustomerRoute from './shared/routes/CustomerRoute'
import PublicCustomerRoute from './shared/routes/PublicCustomerRoute'
import RealtorRoute from './shared/routes/RealtorRoute'
import AdminRoute from './shared/routes/AdminRoute'
import Splash from './components/Splash'
import Landing from './pages/Landing/Landing'
import LoginChoice from './pages/Login/LoginChoice'
import SignUp from './pages/SignUp/SignUp'
import SignUpChoice from './pages/SignUp/SignUpChoice'
import RealtorSignUp from './pages/RealtorSignUp/RealtorSignUp'
import RequestWizard from './pages/RequestWizard/RequestWizard'
import RequestSuccess from './pages/RequestSuccess/RequestSuccess'
import RealtorDashboard from './pages/RealtorDashboard/RealtorDashboard'
import RealtorPending from './pages/RealtorDashboard/RealtorPending'
import RealtorRespond from './pages/RealtorRespond/RealtorRespond'
import ResponseStatus from './pages/ResponseStatus/ResponseStatus'
import Chat from './pages/Chat/Chat'
import MyPage from './pages/MyPage/MyPage'
import MapExplore from './pages/MapExplore/MapExplore'
import PropertyDetail from './pages/PropertyDetail/PropertyDetail'
import AdminDashboard from './pages/AdminDashboard/AdminDashboard'
import AdminLogin from './pages/AdminDashboard/AdminLogin'
import ComingSoon from './pages/ComingSoon/ComingSoon'

function App() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          {showSplash && <Splash onFinish={() => setShowSplash(false)} />}
          <Routes>
            {/* 공개 허브: 비로그인 방문자도 그대로 접근 가능 (Public Entry Flow 승인안).
                로그인한 사용자에게는 PublicCustomerRoute가 CustomerRoute와 동일한 role/심사 체크를 적용한다 */}
            <Route element={<PublicCustomerRoute />}>
              <Route path="/" element={<Landing />} />
              <Route path="/request" element={<RequestWizard />} />
              <Route path="/map" element={<MapExplore />} />
              <Route path="/property/:propertyId" element={<PropertyDetail />} />
            </Route>

            {/* 고객용 비공개 화면 묶음: customer가 아니면 각자 홈으로, 미로그인이면 /login으로 즉시 리다이렉트 */}
            <Route element={<CustomerRoute />}>
              <Route path="/request/success/:requestId" element={<RequestSuccess />} />
              <Route path="/requests/:requestId" element={<ResponseStatus />} />
              <Route path="/mypage" element={<MyPage />} />
            </Route>

            {/* 채팅은 customer/realtor 둘 다 쓰는 공유 화면이라 아직 도메인별 Route Guard로 나누지 않음
                (Chat.jsx를 CustomerChat/RealtorChat으로 분리하는 다음 폴더 이동 Step에서 정리 예정).
                실제 데이터 접근은 RLS(chat_rooms/chat_messages 정책)가 보호하므로 보안 공백은 아님 */}
            <Route path="/chat/:propertyId" element={<Chat />} />

            {/* 로그인 전용 진입점 - 회원가입(/signup) 흐름과 분리 */}
            <Route path="/login" element={<LoginChoice />} />
            <Route path="/login/customer" element={<SignUp mode="login" />} />
            <Route path="/login/realtor" element={<RealtorSignUp initialMode="login" />} />
            {/* 구 URL 대비 */}
            <Route path="/partner/login" element={<Navigate to="/login/realtor" replace />} />

            <Route path="/signup" element={<SignUpChoice />} />
            <Route path="/signup/customer" element={<SignUp />} />
            <Route path="/signup/realtor" element={<RealtorSignUp />} />

            {/* 공인중개사 화면 묶음: role==='realtor'만 허용, 심사 대기 중이면 /realtor/pending으로 */}
            <Route element={<RealtorRoute />}>
              <Route path="/realtor" element={<RealtorDashboard />} />
              <Route path="/realtor/respond/:requestId" element={<RealtorRespond />} />
            </Route>
            <Route path="/realtor/pending" element={<RealtorPending />} />

            <Route path="/coming-soon" element={<ComingSoon />} />

            {/* 운영자 화면: role==='admin'만 허용, 아니면 로그아웃 후 /admin/login으로 */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
            <Route path="/admin/login" element={<AdminLogin />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  )
}

export default App
