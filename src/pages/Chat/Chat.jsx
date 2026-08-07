import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Home, Send, TriangleAlert } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile } from '../../api/auth.api'
import { getPropertyById } from '../../api/properties.api'
import {
  getOrCreatePropertyChatRoom,
  getChatParticipants,
  listMessages,
  sendMessage,
  subscribeToMessages,
  markChatRoomRead,
  subscribeToRoomUpdates,
} from '../../api/chat.api'
import BottomTabBar from '../../components/BottomTabBar'
import { chatText } from './translations'
import './Chat.css'

export default function Chat() {
  const { propertyId } = useParams()
  const { lang } = useLanguage()
  const t = chatText[lang]

  const [myProfile, setMyProfile] = useState(null)
  const [chatRoom, setChatRoom] = useState(null)
  const [otherProfile, setOtherProfile] = useState(null)
  const [property, setProperty] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const bottomRef = useRef(null)
  const isCustomerRef = useRef(false)

  useEffect(() => {
    let unsubscribeMessages = () => {}
    let unsubscribeRoom = () => {}

    async function init() {
      const { data: profile, error: profileError } = await getCurrentProfile()
      if (profileError || !profile) { setError(profileError || t.needLogin); setLoading(false); return }
      setMyProfile(profile)

      const { data: room, error: roomError } = await getOrCreatePropertyChatRoom(propertyId)
      if (roomError) { setError(roomError); setLoading(false); return }
      setChatRoom(room)
      const isCustomer = room.customer_id === profile.id
      isCustomerRef.current = isCustomer

      // 상대 프로필은 022 RPC로 가져온다. 예전에는 chat_rooms에 profiles를 embedded join해서
      // room.realtor / room.customer로 받았는데, 023이 profiles를 잠그면 그 조인이 에러 없이
      // null이 되어 "메시지가 조용히 안 나가는" 상태가 된다(handleSend의 !otherProfile 가드).
      // 인자는 room.id(chat_room_id)다 - propertyId를 넣으면 0행이 온다.
      //
      // ★ "RPC 호출이 실패한 것"과 "호출은 됐는데 상대가 없는 것"을 구분한다.
      //   둘 다 otherProfile=null로 뭉개면, 예컨대 023 정책을 잘못 넣어 RPC가 권한 거부를
      //   내는 상황에서도 화면은 "연결이 오래됐어요"라고 말하게 된다 - 원인을 정반대로
      //   짚게 만드는 안내다. 실패는 아래 error 화면으로, 참여자 없음은 staleConnection으로 간다.
      const { data: participants, error: participantsError } = await getChatParticipants(room.id)
      if (participantsError) {
        // 화면에는 고정 문구만 내보낸다(DB 원문 노출 금지 - Phase 2에서 세운 원칙).
        // 실제 원인은 콘솔에만 남긴다.
        console.error('[chat] get_chat_participants 실패:', participantsError)
        setError(t.participantsFailed)
        setLoading(false)
        return
      }
      setOtherProfile(participants?.find((p) => p.participant_id !== profile.id) ?? null)

      getPropertyById(propertyId).then(({ data }) => setProperty(data))

      const { data: msgs, error: msgsError } = await listMessages(room.id)
      if (msgsError) { setError(msgsError); setLoading(false); return }
      setMessages(msgs)
      setLoading(false)

      // 채팅방을 열었으니 지금 시각으로 "읽음" 기록
      markChatRoomRead(room.id, isCustomer)

      unsubscribeMessages = subscribeToMessages(room.id, (incoming) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === incoming.id)
          if (exists) return prev.map((m) => (m.id === incoming.id ? incoming : m))
          return [...prev, incoming]
        })
        // 채팅방을 보고 있는 중에 새 메시지가 오면 그것도 바로 읽은 걸로 처리
        markChatRoomRead(room.id, isCustomer)
      })

      unsubscribeRoom = subscribeToRoomUpdates(room.id, (updatedRoom) => {
        setChatRoom((prev) => ({ ...prev, ...updatedRoom }))
      })
    }
    init()

    return () => {
      unsubscribeMessages()
      unsubscribeRoom()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || !chatRoom || !myProfile || !otherProfile) return
    setSending(true)
    setText('')
    const { error: sendError } = await sendMessage({
      chatRoomId: chatRoom.id,
      text: trimmed,
      senderLanguage: myProfile.preferred_language,
      recipientLanguage: otherProfile.preferred_language,
    })
    setSending(false)
    if (sendError) setError(sendError)
  }

  if (loading) return <div className="frame"><div style={{ padding: 20 }}>{t.loading}</div></div>
  if (error) return <div className="frame"><div className="rt-error-text" style={{ padding: 20 }}>{error}</div></div>

  const isCustomer = chatRoom.customer_id === myProfile.id
  // 내가 보낸 메시지를, 상대방이 마지막으로 읽은 시각과 비교해서 읽음 여부 계산
  const otherLastReadAt = isCustomer ? chatRoom.realtor_last_read_at : chatRoom.customer_last_read_at
  const firstImage = property?.property_images?.length > 0
    ? [...property.property_images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url
    : null

  return (
    <div className="frame">
      <div className="top-bar">
        <Link className="back-btn" to="/">←</Link>
        <div className="top-title">{otherProfile?.nickname || t.defaultTitle}</div>
      </div>

      {property && (
        <div className="chat-property-card">
          <div className="chat-property-thumb">
            {firstImage ? <img src={firstImage} alt={property.title} /> : <Home size={20} strokeWidth={1.75} />}
          </div>
          <div className="chat-property-info">
            <div className="chat-property-title">{property.title}</div>
            <div className="chat-property-price">
              {t.priceLine(Number(property.deposit ?? 0).toLocaleString(), property.monthly_rent ?? 0)}
            </div>
          </div>
        </div>
      )}

      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">{t.emptyState}</div>}
        {messages.map((m, idx) => {
          const isMine = m.sender_id === myProfile.id
          // 상대방이 보낸 메시지는 나에게 맞게 번역된 텍스트를 우선 보여주고,
          // 내가 보낸 메시지는 내가 쓴 원문 그대로 보여줌
          const primaryText = isMine ? m.original_text : (m.translated_text || m.original_text)
          const showOriginalBelow = !isMine && m.translated_text && m.translated_text !== m.original_text

          // 내가 보낸 마지막 메시지에만 읽음/안읽음 표시 (대화 내내 모든 말풍선에 붙이면 지저분해서)
          const isLastMineMessage = isMine && messages.slice(idx + 1).every((later) => later.sender_id !== myProfile.id)
          const isRead = isMine && otherLastReadAt && new Date(otherLastReadAt) >= new Date(m.created_at)

          return (
            <div className={`chat-msg-row${isMine ? ' mine' : ''}`} key={m.id}>
              {isMine && isLastMineMessage && (
                <span className="chat-read-mark">{isRead ? t.read : t.sent}</span>
              )}
              <div className="chat-bubble">
                <div className="chat-original">{primaryText}</div>
                {showOriginalBelow && <div className="chat-translated">{m.original_text}</div>}
                {!isMine && m.translation_status === 'failed' && (
                  <div className="chat-translate-fail"><TriangleAlert size={12} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 3 }} /> {t.translateFailed}</div>
                )}
                {!isMine && m.translation_status === 'pending' && (
                  <div className="chat-translate-fail">{t.translating}</div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef}></div>
      </div>

      {/* 상대 프로필을 못 가져온 상태에서는 handleSend가 조용히 return해 버린다.
          입력은 되는데 전송만 무시되면 사용자는 새로고침할 이유조차 알 수 없으므로,
          입력창을 막고 이유를 표시한다. (023 적용 후 구버전 번들 탭에서 실제로 이 상태가 된다) */}
      {!otherProfile && (
        <div className="rt-notice-text" style={{ padding: '0 20px', marginTop: 0, textAlign: 'center' }}>
          {t.staleConnection}
        </div>
      )}

      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          placeholder={otherProfile ? t.inputPlaceholder : t.staleConnection}
          value={text}
          disabled={!otherProfile}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />
        <button className="chat-send-btn" disabled={sending || !text.trim() || !otherProfile} onClick={handleSend} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Send size={17} strokeWidth={2} />
        </button>
      </div>

      <BottomTabBar />
    </div>
  )
}
