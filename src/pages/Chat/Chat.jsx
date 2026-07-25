import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCurrentProfile } from '../../api/auth.api'
import { getPropertyById } from '../../api/properties.api'
import {
  getOrCreatePropertyChatRoom,
  listMessages,
  sendMessage,
  subscribeToMessages,
  markChatRoomRead,
  subscribeToRoomUpdates,
} from '../../api/chat.api'
import BottomTabBar from '../../components/BottomTabBar'
import './Chat.css'

export default function Chat() {
  const { propertyId } = useParams()

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
      if (profileError || !profile) { setError(profileError || '로그인이 필요합니다.'); setLoading(false); return }
      setMyProfile(profile)

      const { data: room, error: roomError } = await getOrCreatePropertyChatRoom(propertyId)
      if (roomError) { setError(roomError); setLoading(false); return }
      setChatRoom(room)
      const isCustomer = room.customer_id === profile.id
      isCustomerRef.current = isCustomer
      setOtherProfile(isCustomer ? room.realtor : room.customer)

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

  if (loading) return <div className="frame"><div style={{ padding: 20 }}>불러오는 중...</div></div>
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
        <div className="top-title">{otherProfile?.nickname || '채팅'}</div>
      </div>

      {property && (
        <div className="chat-property-card">
          <div className="chat-property-thumb">
            {firstImage ? <img src={firstImage} alt={property.title} /> : '🏠'}
          </div>
          <div className="chat-property-info">
            <div className="chat-property-title">{property.title}</div>
            <div className="chat-property-price">
              보증금 {Number(property.deposit ?? 0).toLocaleString()}만원 / 월세 {property.monthly_rent ?? 0}만원
            </div>
          </div>
        </div>
      )}

      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">첫 메시지를 보내보세요</div>}
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
                <span className="chat-read-mark">{isRead ? '읽음' : '전송됨'}</span>
              )}
              <div className="chat-bubble">
                <div className="chat-original">{primaryText}</div>
                {showOriginalBelow && <div className="chat-translated">{m.original_text}</div>}
                {!isMine && m.translation_status === 'failed' && (
                  <div className="chat-translate-fail">⚠ 번역 실패, 원문만 표시</div>
                )}
                {!isMine && m.translation_status === 'pending' && (
                  <div className="chat-translate-fail">번역 중...</div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef}></div>
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          placeholder="메시지를 입력하세요"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />
        <button className="chat-send-btn" disabled={sending || !text.trim()} onClick={handleSend}>➤</button>
      </div>

      <BottomTabBar />
    </div>
  )
}
