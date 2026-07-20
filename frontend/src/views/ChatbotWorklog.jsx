import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Plus, Trash2, MessageCircle, Sparkles, Search, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { thaiLlmService } from '../services/thaiLlmService';
import './ChatbotWorklog.css';

// ─── localStorage helpers ────────────────────────────────────────────────────
function storageKey(userId, suffix) {
  return `worklogs_chat:${encodeURIComponent(String(userId || 'anonymous'))}:${suffix}`;
}

function loadRooms(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId, 'rooms'));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveRooms(userId, rooms) {
  try {
    localStorage.setItem(storageKey(userId, 'rooms'), JSON.stringify(rooms));
  } catch { /* quota exceeded */ }
}

function loadActiveRoomId(userId) {
  return localStorage.getItem(storageKey(userId, 'active')) || '';
}

function saveActiveRoomId(userId, id) {
  localStorage.setItem(storageKey(userId, 'active'), id);
}

function createNewRoom(name) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    name: name || `ห้องแชท ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`,
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

// ─── Suggestion Chips ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { text: '🏆 คะแนนของฉัน', query: 'คะแนนสะสมของฉันเท่าไหร่' },
  { text: '📊 สรุปงานทั้งหมดในระบบ', query: 'สรุปงานทั้งหมดที่บันทึกในระบบ แยกตามสถานะ' },
  { text: '📊 สรุปงานทั้งหมดวันนี้', query: 'สรุปงานทั้งหมดวันนี้' },
  { text: '⏳ มีงานค้างกี่งาน?', query: 'มีงานค้างกี่งานตอนนี้' },
  { text: '👥 สรุปงานรายบุคคล', query: 'สรุปงานรายบุคคลในทีม' },
  { text: '📝 สรุปบรีฟงานสัปดาห์นี้', query: 'สรุปบรีฟงานสัปดาห์นี้ทั้งหมด พร้อมคะแนนรวม' },
  { text: '🔍 ค้นหาข้อมูลทั่วไป', query: 'React hooks คืออะไร อธิบายให้เข้าใจง่าย' },
  { text: '📝 สรุปข้อความที่วาง', query: 'สรุปข้อความต่อไปนี้เป็นประเด็นสำคัญ สิ่งที่ต้องทำต่อ และกำหนดเวลา:\n\n[วางข้อความที่นี่]' },
  { text: '🐱 ทักทาย AI', query: 'สวัสดีครับ แนะนำตัวหน่อย' },
];

// ─── Component ───────────────────────────────────────────────────────────────
export const ChatbotWorklog = () => {
  const { user } = useAuth();
  const userId = String(user?.ID || user?.id || '');
  const userRole = user?.Role || user?.role || 'Staff';
  const userDepartment = user?.Department || user?.department || '';
  const accessDescription = userRole === 'Admin'
    ? 'ดูข้อมูลพนักงานและทุกแผนกได้ทั้งหมด'
    : userRole === 'Head'
      ? `ดูข้อมูลตนเองและพนักงานในแผนก ${userDepartment || 'ที่รับผิดชอบ'} ได้`
      : 'ดูได้เฉพาะข้อมูลของบัญชีตนเอง ไม่สามารถค้นข้อมูลพนักงานคนอื่นได้';
  const [rooms, setRooms] = useState(() => loadRooms(userId));
  const [activeRoomId, setActiveRoomId] = useState(() => loadActiveRoomId(userId));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Save to localStorage on change
  useEffect(() => { saveRooms(userId, rooms); }, [rooms, userId]);
  useEffect(() => { saveActiveRoomId(userId, activeRoomId); }, [activeRoomId, userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rooms, activeRoomId]);

  // Active room
  const activeRoom = useMemo(
    () => rooms.find(r => r.id === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  // ─── Room Management ────────────────────────────────────────────────────
  const handleNewRoom = useCallback(() => {
    const room = createNewRoom();
    setRooms(prev => [room, ...prev]);
    setActiveRoomId(room.id);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleSelectRoom = useCallback((id) => {
    setActiveRoomId(id);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleDeleteRoom = useCallback((e, id) => {
    e.stopPropagation();
    setRooms(prev => prev.filter(r => r.id !== id));
    if (activeRoomId === id) {
      setActiveRoomId(rooms.length > 1 ? rooms.find(r => r.id !== id)?.id || '' : '');
    }
  }, [activeRoomId, rooms]);

  // ─── Send Message ────────────────────────────────────────────────────────
  const handleSend = useCallback(async (overrideInput) => {
    const text = (overrideInput || input).trim();
    if (!text || isLoading || !activeRoom) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    };

    // Add user message to room
    setRooms(prev => prev.map(r =>
      r.id === activeRoomId
        ? { ...r, messages: [...r.messages, userMsg] }
        : r
    ));
    setInput('');
    setIsLoading(true);

    // Build history from this room's messages
    const historyMsgs = [...(activeRoom.messages || []).slice(-7), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await thaiLlmService.sendChat(historyMsgs, {
      enableWebSearch: true,
      dashboardFilters: thaiLlmService.getDashboardFilters(userId),
    });

    const botMsg = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: result.success ? result.answer : result.message,
      thinking: result.success ? result.thinking : null,
      searchPerformed: result.success ? result.searchPerformed : false,
      sources: result.success ? result.sources : [],
      isError: !result.success && result.error === 'rate_limit',
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    };

    setRooms(prev => prev.map(r =>
      r.id === activeRoomId
        ? { ...r, messages: [...r.messages, botMsg] }
        : r
    ));

    setIsLoading(false);
  }, [input, isLoading, activeRoom, activeRoomId, userId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (query) => {
    if (!activeRoom) {
      // Create a new room first
      const room = createNewRoom();
      setRooms(prev => [room, ...prev]);
      setActiveRoomId(room.id);
      setTimeout(() => handleSend(query), 100);
    } else {
      handleSend(query);
    }
  };

  const toggleThinking = (msgId) => {
    setShowThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const userInitial = (user?.Name || user?.name || user?.Username || 'U').charAt(0).toUpperCase();
  const rateLimitUsage = thaiLlmService.rateLimiter.getUsage();

  return (
    <div className="chatbot-page">
      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <div className="chatbot-sidebar">
        <div className="chatbot-sidebar-header">
          <h2>
            <MessageCircle size={18} />
            CatLog AI
            <span className="beta-badge">BETA</span>
          </h2>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            ใช้ AI สรุปงาน ถามตอบ ค้นหาข้อมูล
          </div>
        </div>

        <div className="chatbot-rooms-list">
          <button className="new-room-btn" onClick={handleNewRoom}>
            <Plus size={16} /> สร้างห้องแชทใหม่
          </button>

          {rooms.map(room => (
            <div
              key={room.id}
              className={`chatbot-room-item ${room.id === activeRoomId ? 'active' : ''}`}
              onClick={() => handleSelectRoom(room.id)}
            >
              <div className="room-icon">
                <MessageCircle size={16} />
              </div>
              <div className="room-info">
                <h4>{room.name}</h4>
                <p>{room.messages.length} ข้อความ</p>
              </div>
              <button
                className="room-delete"
                onClick={(e) => handleDeleteRoom(e, room.id)}
                title="ลบห้องแชท"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {rooms.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 10px', fontSize: 12 }}>
              ยังไม่มีห้องแชท<br />กด "สร้างห้องแชทใหม่" เพื่อเริ่มต้น
            </div>
          )}
        </div>

        {/* Knowledge Cards */}
        <div className="knowledge-cards">
          <div className="knowledge-title">
            <span>📘 คู่มือใช้ CatLog AI</span>
            <span className="knowledge-count">4 วิธี</span>
          </div>
          <div className="knowledge-card access">
            <span className="kc-icon">🔐</span>
            <span className="knowledge-copy"><strong>ระดับสิทธิ์: {userRole}</strong><small>{accessDescription}</small></span>
          </div>
          <div className="knowledge-card internal-guide">
            <span className="kc-icon">📊</span>
            <span className="knowledge-copy">
              <strong>ถามข้อมูลในระบบ</strong>
              <small>ระบุคน ช่วงเวลา สถานะ หรือชื่อโปรเจกต์ ตัวเลขจะมาจากฐานข้อมูลตามสิทธิ์</small>
              <button className="knowledge-example" onClick={() => { setInput('คะแนนสะสมของฉันเดือน 07/2026 เท่าไหร่'); textareaRef.current?.focus(); }}>ลอง: คะแนนของฉันรายเดือน</button>
            </span>
          </div>
          <div className="knowledge-card web-guide">
            <span className="kc-icon">🌐</span>
            <span className="knowledge-copy">
              <strong>ค้นเว็บและสรุปข่าว</strong>
              <small>ใช้คำว่า “ล่าสุด” พร้อมหัวข้อ CatLog AI จะรวมข่าวเหตุการณ์เดียวกันและแสดงแหล่งข้อมูลท้ายคำตอบ</small>
              <button className="knowledge-example" onClick={() => { setInput('สรุปข่าวสำคัญในไทยล่าสุดจากหลายแหล่ง พร้อมวันที่และยอดผู้เสียหาย'); textareaRef.current?.focus(); }}>ลอง: สรุปข่าวหลายแหล่ง</button>
            </span>
          </div>
          <div className="knowledge-card summary-guide">
            <span className="kc-icon">📝</span>
            <span className="knowledge-copy">
              <strong>สรุปข้อความหรืองาน</strong>
              <small>วางข้อความยาว แล้วบอกสิ่งที่ต้องการ เช่น ประเด็นสำคัญ ผู้รับผิดชอบ กำหนดส่ง และความเสี่ยง</small>
              <button className="knowledge-example" onClick={() => { setInput('สรุปข้อความต่อไปนี้เป็น: 1) ประเด็นสำคัญ 2) สิ่งที่ต้องทำ 3) ผู้รับผิดชอบ 4) กำหนดส่ง\n\n[วางข้อความที่นี่]'); textareaRef.current?.focus(); }}>ลอง: เตรียมคำสั่งสรุป</button>
            </span>
          </div>
          <div className="knowledge-card prompt-guide">
            <span className="kc-icon">💡</span>
            <span className="knowledge-copy">
              <strong>ถามให้แม่นขึ้น</strong>
              <small>สูตรง่าย ๆ: <b>เรื่องที่หา + ใคร + ช่วงเวลา + รูปแบบคำตอบ</b><br />ตัวอย่าง “งานค้างของฉันเดือนนี้ แยกตามสถานะ”</small>
            </span>
          </div>
          <div className="knowledge-note">BETA · แชทเก็บในเครื่อง · จำกัด 60 ครั้ง/นาที</div>
        </div>
      </div>

      {/* ─── Main Chat Area ──────────────────────────────────────────── */}
      <div className="chatbot-main">
        {activeRoom ? (
          <>
            {/* Header */}
            <div className="chatbot-main-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/pixel_cat_v2.png" alt="Cat AI" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{activeRoom.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {activeRoom.messages.length} ข้อความ · API: {rateLimitUsage.perMinute}/{rateLimitUsage.maxPerMinute} ครั้ง/นาที
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => {
                    if (window.confirm('ล้างข้อความทั้งหมดในห้องนี้?')) {
                      setRooms(prev => prev.map(r =>
                        r.id === activeRoomId ? { ...r, messages: [] } : r
                      ));
                    }
                  }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: 'white', cursor: 'pointer', fontSize: 12, color: '#64748b',
                    display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit'
                  }}
                >
                  <RefreshCw size={12} /> ล้างแชท
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="chatbot-messages-area">
              {activeRoom.messages.length === 0 && (
                <div className="chatbot-welcome">
                  <div className="welcome-icon">
                    <img src="/pixel_cat_v2.png" alt="Cat AI" style={{ width: 72, height: 72, objectFit: 'contain' }} />
                  </div>
                  <h2>CatLog AI</h2>
                  <p>
                    ผู้ช่วยงานอัจฉริยะสำหรับระบบ WorkLogs
                    ถามข้อมูลงาน ค้นเว็บ หรือวางข้อความยาวเพื่อสรุปได้
                  </p>
                  <div className="suggestion-chips">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        className="suggestion-chip"
                        onClick={() => handleSuggestion(s.query)}
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeRoom.messages.map(msg => (
                <div key={msg.id} className={`chat-msg ${msg.role}`}>
                  <div className="msg-avatar">
                    {msg.role === 'user' ? userInitial : (
                      <img src="/pixel_cat_v2.png" alt="Cat AI" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                    )}
                  </div>
                  <div style={{ maxWidth: '75%', minWidth: 0 }}>
                    {msg.isError && (
                      <div className="rate-limit-warning">{msg.content}</div>
                    )}
                    {!msg.isError && (
                      <>
                        {msg.searchPerformed && (
                          <div className="search-badge">
                            <Search size={10} /> ค้นหาจากอินเทอร์เน็ต
                          </div>
                        )}
                        {msg.thinking && (
                          <div className="chat-thinking-section">
                            <button
                              className="chat-thinking-toggle"
                              onClick={() => toggleThinking(msg.id)}
                            >
                              <Sparkles size={12} />
                              {showThinking[msg.id] ? 'ซ่อนกระบวนการคิด' : '💭 ดูกระบวนการคิดของ AI'}
                            </button>
                            {showThinking[msg.id] && (
                              <div className="chat-thinking-content">
                                {msg.thinking}
                              </div>
                            )}
                          </div>
                        )}
                        {msg.role === 'assistant' ? (
                          <div
                            className="msg-bubble"
                            dangerouslySetInnerHTML={{
                              __html: thaiLlmService.markdownToHtml(msg.content)
                            }}
                          />
                        ) : (
                          <div className="msg-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                            {msg.content}
                          </div>
                        )}
                        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200/80">
                            <div className="text-[10px] font-bold text-slate-400 mb-1">แหล่งข้อมูล</div>
                            {msg.sources.slice(0, 3).map((source, index) => (
                              <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 truncate">
                                <ExternalLink size={10} className="shrink-0" /> <span className="truncate">{source.title || source.url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="msg-time">{msg.timestamp}</div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="chat-msg assistant">
                  <div className="msg-avatar">
                    <img src="/pixel_cat_v2.png" alt="Cat AI" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  </div>
                  <div className="msg-bubble">
                    <div style={{ fontSize: 12, color: '#6366f1', marginBottom: 4, fontWeight: 500 }}>
                      กำลังคิด...
                    </div>
                    <div className="typing-indicator">
                      <div className="dot" />
                      <div className="dot" />
                      <div className="dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chatbot-input-area">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ถามงาน ค้นเว็บ หรือวางข้อความเพื่อสรุป… (สูงสุด 12,000 ตัวอักษร)"
                rows={1}
                disabled={isLoading}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                title="ส่งข้อความ"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          /* No room selected */
          <div className="chatbot-welcome">
            <div className="welcome-icon">
              <img src="/pixel_cat_v2.png" alt="Cat AI" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            </div>
            <h2>CatLog AI</h2>
            <p>
              เลือกห้องแชทจากเมนูด้านซ้าย หรือสร้างห้องใหม่เพื่อเริ่มสนทนา
            </p>
            <button className="suggestion-chip" onClick={handleNewRoom}>
              <Plus size={14} style={{ marginRight: 4 }} /> สร้างห้องแชทใหม่
            </button>
            <div className="suggestion-chips" style={{ marginTop: 16 }}>
              {SUGGESTIONS.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => handleSuggestion(s.query)}
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
