import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Trash2, Sparkles, PanelRightClose, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { thaiLlmService } from '../services/thaiLlmService';
import '../views/ChatbotWorklog.css';

function miniStorageKey(userId) {
  return `worklogs_chat:${encodeURIComponent(String(userId || 'anonymous'))}:mini`;
}

function miniHintStorageKey(userId) {
  return `worklogs_chat:${encodeURIComponent(String(userId || 'anonymous'))}:catlog-hint-seen`;
}

function shouldShowMiniHint(userId) {
  try {
    return localStorage.getItem(miniHintStorageKey(userId)) !== '1';
  } catch {
    return true;
  }
}

function loadMiniMessages(userId) {
  try {
    const raw = localStorage.getItem(miniStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveMiniMessages(userId, msgs) {
  try {
    localStorage.setItem(miniStorageKey(userId), JSON.stringify(msgs.slice(-50)));
  } catch { /* quota exceeded */ }
}

export const MiniChatBot = () => {
  const { user } = useAuth();
  const userId = String(user?.ID || user?.id || '');
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState(() => loadMiniMessages(userId));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState({});
  const [showDiscoveryHint, setShowDiscoveryHint] = useState(() => shouldShowMiniHint(userId));
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    saveMiniMessages(userId, messages);
  }, [messages, userId]);

  useEffect(() => {
    if (!showDiscoveryHint) return undefined;

    const timer = setTimeout(() => {
      setShowDiscoveryHint(false);
      try { localStorage.setItem(miniHintStorageKey(userId), '1'); } catch { /* storage unavailable */ }
    }, 9000);

    return () => clearTimeout(timer);
  }, [showDiscoveryHint, userId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [isOpen, messages.length]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      setIsClosing(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
      }, 300);
    } else {
      setShowDiscoveryHint(false);
      try { localStorage.setItem(miniHintStorageKey(userId), '1'); } catch { /* storage unavailable */ }
      setIsOpen(true);
    }
  }, [isOpen, userId]);

  const handleClear = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(miniStorageKey(userId));
  }, [userId]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const historyMsgs = [...messages.slice(-6), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await thaiLlmService.sendChat(historyMsgs, {
      enableWebSearch: true,
      dashboardFilters: thaiLlmService.getDashboardFilters(userId),
    });

    if (result.success) {
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.answer,
        thinking: result.thinking,
        searchPerformed: result.searchPerformed,
        sources: result.sources,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
    } else {
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.message,
        isError: result.error === 'rate_limit',
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setIsLoading(false);
  }, [input, isLoading, messages, userId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleThinking = (msgId) => {
    setShowThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Hide Mini Chat completely when user is on /chatbot page to avoid redundancy
  if (location.pathname === '/chatbot') {
    return null;
  }

  const userInitial = (user?.Name || user?.name || user?.Username || 'U').charAt(0).toUpperCase();

  return (
    <>
      {/* Overlay backdrop when panel is open (mobile) */}
      {isOpen && (
        <div
          className="mini-chat-overlay"
          onClick={handleToggle}
        />
      )}

      {/* Cat Floating Button */}
      <button
        className={`cat-bubble-btn ${isOpen ? 'cat-bubble-active' : ''}`}
        onClick={handleToggle}
        title={isOpen ? 'ปิด CatLog AI' : 'เปิด CatLog AI'}
        aria-label={isOpen ? 'ปิดหน้าต่าง CatLog AI' : 'เปิดหน้าต่าง CatLog AI'}
        aria-expanded={isOpen}
        aria-controls="mini-chat-panel"
        aria-describedby="catlog-ai-hint"
        id="mini-chat-toggle"
      >
        {isOpen ? (
          <ChevronRight className="cat-close-icon" size={24} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <img src="/pixel_cat_v2.png" alt="Cat AI" className="cat-pixel-img" />
        )}
      </button>

      {!isOpen && (
        <div
          id="catlog-ai-hint"
          className={`cat-discovery-hint ${showDiscoveryHint ? 'is-visible' : ''}`}
          role="status"
        >
          <strong>CatLog AI <span>BETA</span></strong>
          <small>ถามงาน · ค้นเว็บ · สรุปข้อความ</small>
          <em>กดที่แมวเพื่อเริ่มคุย</em>
        </div>
      )}

      {/* Slide-in Panel from right side */}
      <div id="mini-chat-panel" className={`mini-chat-panel ${isOpen ? 'open' : ''} ${isClosing ? 'closing' : ''}`}>
        {/* Header */}
        <div className="mini-chat-header">
          <div className="header-avatar-pixel">
            <img src="/pixel_cat_v2.png" alt="Cat AI" className="header-cat-img" />
          </div>
          <div className="header-info">
            <h3>CatLog AI <span className="beta-badge" style={{ marginLeft: 6, fontSize: 9 }}>BETA</span></h3>
            <p>ผู้ช่วยงาน ค้นเว็บ และสรุปข้อความ</p>
          </div>
          <div className="header-actions">
            <button onClick={handleClear} title="ล้างแชท"><Trash2 size={15} /></button>
            <button onClick={handleToggle} title="ปิด">
              <PanelRightClose size={15} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="mini-chat-messages">
          {messages.length === 0 ? (
            <div className="mini-chat-empty">
              <div className="empty-icon-pixel">
                <img src="/pixel_cat_v2.png" alt="Cat AI" className="empty-cat-img" />
              </div>
              <p><strong>สวัสดีครับ! ผมคือ CatLog AI</strong></p>
              <p>ถามข้อมูลงาน ค้นเว็บ หรือวางข้อความยาวเพื่อสรุปได้</p>
              <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                💾 ข้อมูลแชทเก็บในเครื่อง ถ้าล้างเบราว์เซอร์จะหาย
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`chat-msg ${msg.role}`}>
                <div className="msg-avatar">
                  {msg.role === 'user' ? userInitial : (
                    <img src="/pixel_cat_v2.png" alt="Cat AI" className="msg-cat-img" />
                  )}
                </div>
                <div style={{ maxWidth: '80%' }}>
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
                            {showThinking[msg.id] ? 'ซ่อนกระบวนการคิด' : 'ดูกระบวนการคิด'}
                          </button>
                          {showThinking[msg.id] && (
                            <div className="chat-thinking-content">{msg.thinking}</div>
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
                        <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-1">
                          <div className="text-[10px] font-bold text-slate-400">แหล่งข้อมูล</div>
                          {msg.sources.slice(0, 2).map((source, index) => (
                            <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-violet-600 truncate">
                              <ExternalLink size={10} className="shrink-0" /><span className="truncate">{source.title || source.url}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="msg-time">{msg.timestamp}</div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="chat-msg assistant">
              <div className="msg-avatar">
                <img src="/pixel_cat_v2.png" alt="Cat AI" className="msg-cat-img" />
              </div>
              <div className="msg-bubble">
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
        <div className="mini-chat-input-area">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ถาม ค้นเว็บ หรือวางข้อความเพื่อสรุป…"
            rows={1}
            disabled={isLoading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="ส่ง"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
};
