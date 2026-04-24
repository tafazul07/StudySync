import React, { useState, useRef, useEffect } from 'react';

const Chat = ({ messages, onSend, userName }) => {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSend(text.trim());
      setText('');
    }
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>\ud83d\udcac Chat</h3>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`chat-msg ${msg.sender === userName ? 'own' : ''}`}
          >
            <div className="msg-meta">
              <span className="msg-sender">{msg.sender.slice(0, 8)}</span>
              <span className="msg-time">{formatTime(msg.timestamp)}</span>
            </div>
            <div className="msg-text">{msg.text}</div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="chat-send">\u27a1</button>
      </form>
    </div>
  );
};

export default Chat;
