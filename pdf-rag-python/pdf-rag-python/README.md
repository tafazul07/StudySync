# PDF RAG System (Python + FastAPI)

A production-ready PDF Retrieval-Augmented Generation system using Python, FastAPI, and OpenRouter's free LLM models.

## Features

- **PDF Upload & Text Extraction**: Extract text from PDFs using PyPDF2
- **Smart Chunking**: Sentence-aware chunking with configurable overlap (1000-1500 tokens)
- **Local Embeddings**: Free embeddings using `sentence-transformers` (all-MiniLM-L6-v2)
- **FAISS Vector Store**: Fast similarity search with FAISS-CPU
- **OpenRouter Integration**: Uses free `meta-llama/llama-3.3-70b-instruct:free` model
- **LRU Caching**: Caches embeddings and query responses for performance
- **Modern Frontend**: Dark-themed UI with drag-and-drop support
- **Modular Architecture**: Clean separation of routes, controllers, services, and utils

## Architecture

```
pdf-rag-python/
├── backend/
│   ├── app/
│   │   ├── config.py          # Configuration & environment
│   │   ├── routes/
│   │   │   ├── pdf_routes.py  # PDF upload endpoints
│   │   │   └── query_routes.py # Query endpoints
│   │   ├── controllers/
│   │   │   ├── pdf_controller.py
│   │   │   └── query_controller.py
│   │   ├── services/
│   │   │   ├── pdf_service.py        # PDF text extraction
│   │   │   ├── chunking_service.py   # Text chunking
│   │   │   ├── embedding_service.py  # Vector embeddings
│   │   │   ├── vectorstore_service.py # FAISS vector DB
│   │   │   ├── retrieval_service.py  # Similarity search
│   │   │   └── ai_service.py         # OpenRouter LLM calls
│   │   ├── utils/
│   │   │   ├── text_cleaner.py       # Text preprocessing
│   │   │   ├── similarity.py         # Cosine similarity
│   │   │   └── cache.py              # LRU cache
│   │   └── middleware/
│   │       └── error_handler.py      # Global error handling
│   ├── main.py                # FastAPI application entry
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Environment variables
├── frontend/
│   └── index.html             # Single-page UI
├── .env                       # Root environment config
├── requirements.txt           # Root dependencies
└── README.md                  # This file
```

## Installation

### Prerequisites
- Python 3.12 or 3.14 (recommended)
- pip

### 1. Clone and Setup

```bash
cd pdf-rag-python
```

### 2. Create Virtual Environment

```bash
# Linux/Mac
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

> **Note**: This project is optimized for **Python 3.12**. Download from [python.org](https://www.python.org/downloads/release/python-3126/).

> The first run will download the `all-MiniLM-L6-v2` embedding model (~80MB) automatically.

### 4. Configure Environment

Edit `backend/.env` (and optionally `.env`):

```env
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-api-key-here
```

Make sure this is a valid OpenRouter key. If the placeholder value remains, the backend will fail with an authentication error.

Get your free API key at: https://openrouter.ai/keys

### 5. Run Backend

```bash
cd backend
python main.py
```

Server starts at: http://localhost:8000

### 6. Open Frontend

Simply open `frontend/index.html` in your browser, or serve it:

```bash
# Using Python's built-in server
cd frontend
python -m http.server 3000
```

Then visit: http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pdf/upload` | Upload PDF file (multipart/form-data, field: `pdf`) |
| GET | `/api/pdf/stats` | Get indexed document statistics |
| DELETE | `/api/pdf/clear` | Clear all indexed documents |
| POST | `/api/query/ask` | Ask question (JSON: `{"question": "...", "top_k": 5}`) |
| GET | `/health` | Health check |

## API Examples

### Upload PDF
```bash
curl -X POST "http://localhost:8000/api/pdf/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "pdf=@document.pdf"
```

### Ask Question
```bash
curl -X POST "http://localhost:8000/api/query/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main findings?", "top_k": 5}'
```

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8000 | Server port |
| `OPENROUTER_API_KEY` | - | Your OpenRouter API key |
| `OPENROUTER_MODEL` | meta-llama/llama-3.3-70b-instruct:free | LLM model |
| `CHUNK_SIZE` | 1200 | Target tokens per chunk |
| `CHUNK_OVERLAP` | 200 | Overlap tokens between chunks |
| `TOP_K` | 5 | Number of chunks to retrieve |
| `MAX_FILE_SIZE_MB` | 50 | Max upload size |

## Tech Stack

- **Backend**: FastAPI, Uvicorn
- **PDF Parsing**: PyPDF2
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)
- **Vector DB**: FAISS-CPU
- **LLM**: OpenRouter (meta-llama/llama-3.3-70b-instruct:free)
- **HTTP Client**: httpx
- **Frontend**: Vanilla HTML/JS (no build step)

## Troubleshooting

### Model Download Issues
If embedding model download fails:
```bash
pip install --upgrade sentence-transformers
```

### FAISS Installation Issues
On some systems, install via conda:
```bash
conda install -c pytorch faiss-cpu
```

### pydantic-core / Windows Compatibility
If you see a `pydantic-core` wheel build error on Windows with Python 3.14, use the pinned package versions in `requirements.txt`.
This project is verified with:
```bash
pydantic==2.13.3
pydantic-settings==2.6.1
```
If pip still tries to build from source, upgrade packaging tools first:
```bash
python -m pip install --upgrade pip setuptools wheel
```

### OpenRouter Rate Limits
Free models have rate limits. If you hit limits:
- Wait a few seconds between requests
- Check your usage at https://openrouter.ai/activity

## License

MIT
