# 🧠 Quiz Generator - FYP Project

AI-powered quiz generator using **OpenRouter API**. No database needed — everything stored in JSON files.

## Features

- 📄 **PDF, DOCX, TXT** upload with OCR for scanned documents
- 🎯 **MCQ** (4 options, 1 correct) and **Fill in the Blanks**
- 🧩 **RAG Pipeline**: Chunking + embeddings + similarity search
- 💯 **Source-Grounded**: Answers from your documents only
- ⚡ **Fast**: Cloud API responds in 2-5 seconds
- 💾 **Zero Database**: All data in JSON files

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Storage | JSON files (no database) |
| LLM | OpenRouter API (free tier) |
| Embeddings | Lightweight JS algorithm |
| OCR | Tesseract.js |
| Frontend | Vanilla HTML/CSS/JS |

## Prerequisites

1. **Node.js** (v18+)
2. **OpenRouter API Key** (free)

## Quick Start

### 1. Get OpenRouter API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up (free)
3. Get API key from [Settings → Keys](https://openrouter.ai/settings/keys)

### 2. Setup Project

```bash
cd quiz-generator
npm install
```

### 3. Create .env File

```env
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
PORT=3000
```

### 4. Start Server

```bash
npm start
```

### 5. Open Browser

Navigate to `http://localhost:3000`

## Free Models on OpenRouter

| Model | Speed | Quality |
|-------|-------|---------|
| `meta-llama/llama-3.1-8b-instruct` | ⚡ Fast | Good |
| `google/gemma-2-9b-it` | ⚡ Fast | Good |
| `mistralai/mistral-7b-instruct` | ⚡ Fast | Very Good |

Free tier: 20 requests/minute, 200 requests/day

## Data Storage

All data stored in `data/` folder (auto-created):

| File | Contents |
|------|----------|
| `data/documents.json` | Document metadata |
| `data/chunks.json` | Text chunks + embeddings |
| `data/quizzes.json` | Generated quizzes |

No database server needed!

## How It Works

```
Upload Document
    │
    ├──→ Extract Text (pdf-parse / mammoth / tesseract OCR)
    │
    ↓
Chunk into ~800 word pieces
    │
    ↓
Generate Embeddings (lightweight JS algorithm)
    │
    ↓
Store in JSON files
    │
    ════════════════════════ (User requests quiz)
    │
    ↓
Embed query → JS cosine similarity → top 5 chunks
    │
    ↓
Send chunks to OpenRouter API
    │
    ↓
Generate quiz (2-5 seconds)
    │
    ↓
Display with score tracking
```

## Troubleshooting

### "OpenRouter API key not configured"
- Create `.env` file with `OPENROUTER_API_KEY=sk-or-v1-...`
- Restart server after editing `.env`

### "OpenRouter rate limit hit"
- Free tier: 20 req/min, 200 req/day
- Wait a minute and try again

## License

MIT - For FYP use only.
