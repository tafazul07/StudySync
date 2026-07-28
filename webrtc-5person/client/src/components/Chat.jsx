import React, { useState, useRef, useEffect } from 'react';

const Chat = ({ messages, onSend, userName, mySocketId }) => {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSend(text.trim());
      setText('');
      inputRef.current?.focus();
    }
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isOwnMessage = (msg) => {
    // Check if sender matches our socket ID or our userName
    return msg.sender === mySocketId || msg.sender === userName || msg.sender.includes(mySocketId?.slice(0, 8));
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>💬 Chat</h3>
        <span className="chat-count">{messages.length} messages</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="empty-icon">💬</span>
            <p>No messages yet</p>
            <p className="empty-sub">Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = isOwnMessage(msg);
          return (
            <div
              key={msg.id}
              className={`chat-msg ${isOwn ? 'own' : ''}`}
            >
              <div className="msg-bubble">
                <div className="msg-meta">
                  <span className="msg-sender">{isOwn ? 'You' : msg.sender.slice(0, 8)}</span>
                  <span className="msg-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="msg-text">{msg.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="chat-send" disabled={!text.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
};

export default Chat;
