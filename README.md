# Analytics RAG Chatbot

A PDF question-answering application that combines FastAPI, ChromaDB, Hugging Face embeddings, Groq, and a React/Vite frontend.

Upload PDF documents, ask questions about them, inspect source chunks, preview PDFs, and adjust retrieval settings from the chat workspace.

## Features

- Upload and persist PDF documents
- Extract PDF text and store searchable embeddings in ChromaDB
- Ask questions about all documents or a selected PDF
- Conversational follow-up questions using recent chat history
- Markdown tables and chart responses
- Clickable source citations with full retrieved snippets
- Embedded PDF preview beside the chat
- Adjustable retrieval depth from 1 to 12 chunks
- Optional retrieval similarity scores
- Document metadata: filename, page count, and upload date
- Delete documents and their indexed chunks
- Dashboard analytics with PDF distribution chart
- Horizontal navigation for Home, uploaded PDFs, and chat history
- Dark and light themes

## Project Structure

```text
rag-chatbot/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── chat.py          # Retrieval, memory, and LLM responses
│   ├── indest.py        # PDF ingestion and embeddings
│   ├── chroma_db/       # Local ChromaDB data
│   └── uploads/         # Persisted uploaded PDFs
├── frontend/
│   └── src/App.jsx      # React application
├── requirements.txt
└── README.md
```

## Prerequisites

- Python 3.10 or newer
- Node.js and npm
- A Groq API key

## Backend Setup

From the repository root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key
```

Start the API:

```powershell
cd backend
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.

## Frontend Setup

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

The frontend expects the backend at `http://localhost:8000`.

## Useful Commands

Frontend production build:

```powershell
cd frontend
npm run build
```

Frontend lint:

```powershell
cd frontend
npm run lint
```

Backend syntax check:

```powershell
cd backend
python -m py_compile main.py chat.py indest.py
```

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check API status |
| `POST` | `/upload` | Upload and index a PDF |
| `GET` | `/documents` | List indexed documents and metadata |
| `GET` | `/documents/{doc_id}/file` | Stream a PDF for preview |
| `DELETE` | `/documents/{doc_id}` | Delete a PDF and its vectors |
| `POST` | `/chat` | Ask a question with retrieval options |

The chat request supports `doc_id`, `chat_history`, `top_k`, and `show_scores`.

## Notes

- Uploaded PDFs are stored in `backend/uploads/`.
- ChromaDB data is stored in `backend/chroma_db/`.
- Chat history is currently stored in the browser's `localStorage`, not on the server.
- The dashboard currently shows one user because authentication and a user database are not implemented.
- Existing documents created before PDF persistence or upload-date tracking may not have an available file or exact upload timestamp.
- Keep `.env`, `backend/uploads/`, and local database files out of public repositories when they contain private data.
