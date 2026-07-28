# Brain Sync - FYP Collaborative Editor

A Google Docs-like real-time collaborative document editor with **paragraph-level permissions**, **version history**, **AI writing assistant**, and **table of contents**.

---

## ✨ Features

- ✅ **Real-time multi-user editing** (Yjs CRDTs + WebSockets)
- ✅ **Rich text formatting** (Bold, Italic, Headings, Lists, Quotes, Code)
- ✅ **Live cursors** with usernames
- ✅ **Auto-save** to PostgreSQL every 10 seconds
- ✅ **Comments** on paragraphs
- ✅ **Paragraph-level permissions** (read/edit/none) — FYP differentiator
- ✅ **Table of Contents** — auto-generated from headings, clickable navigation
- ✅ **Version History** — save named versions, preview, and restore
- ✅ **AI Writing Assistant** — via OpenRouter (backend proxy, key hidden in .env)
- ✅ **Google Docs-style UI**

---

## 📁 Structure

```
brainsync/
├── client/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── server/
│   ├── package.json
│   ├── .env.example      ← copy to .env and fill in
│   ├── server.js         ← REST API + AI proxy + versions
│   └── yjs-server.js     ← WebSocket CRDT sync
└── database/
    └── schema.sql
```

---

## 🛠️ Setup

### 1. Database

Open **pgAdmin** → Create database `brainsync` → Open Query Tool → Paste and run `database/schema.sql`.

### 2. Backend Environment

```bash
cd server
cp .env.example .env
```

Edit `.env`:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=brainsync
DB_PASSWORD=your_password
DB_PORT=5432

# Get free key at https://openrouter.ai
OPENROUTER_API_KEY=sk-or-v1-your-key-here

PORT=3000
```

### 3. Install & Run

```bash
cd server
npm install

# Terminal 1
node server.js

# Terminal 2
node yjs-server.js
```

### 4. Open Browser

```
http://localhost:3000
```

---

## 🎯 FYP Differentiators

| Feature | Google Docs | Brain Sync |
|---------|-------------|------------|
| Sync tech | Operational Transform | **CRDTs** (Yjs) |
| Permissions | Document-level only | **Paragraph-level** |
| AI | Gemini (general) | **OpenRouter** (any model, backend proxy) |
| TOC | Manual | **Auto-generated** |
| Versions | Automatic only | **Named, previewable, restorable** |

---

## 📝 Version History Usage

1. Click **Version history** in the top menu
2. Click **💾** to save current state with a name
3. Click **Preview** to see old version without changing current doc
4. Click **Restore** to roll back to that version

---

## 🤖 AI Usage

1. Click **🤖 AI** button in top right
2. Type a prompt or select text and click **Improve** / **Summarize**
3. AI responds via backend proxy (your API key is never exposed to frontend)

---

## 🧪 Test Collaboration

1. Open `http://localhost:3000` in Chrome
2. Open `http://localhost:3000` in Firefox
3. Type in either — both sync live with colored cursors
