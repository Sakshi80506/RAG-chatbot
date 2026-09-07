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

## Deploy on Render

This repository includes a [`render.yaml`](render.yaml) Blueprint that creates:

- `rag-chatbot-api`: the FastAPI backend with a 1 GB persistent disk for PDFs,
  ChromaDB, and the downloaded embedding model.
- `rag-chatbot-frontend`: a static Vite site. Its `VITE_API_URL` is set
  automatically to the backend's public URL during the build.

1. Push this repository to GitHub, GitLab, or Bitbucket. Do not commit your
   `backend/.env` file or uploaded PDFs.
2. In the [Render Dashboard](https://dashboard.render.com/), select **New** >
   **Blueprint**, connect the repository, and accept the services detected from
   `render.yaml`.
3. When Render prompts for it, enter `GROQ_API_KEY`. This value is marked as a
   secret and is not stored in the repository.
4. Deploy. Wait for the API to become live first; Render then builds the static
   site with the API URL. Open the frontend service URL to use the app.

The backend service uses Render's `starter` plan because PDF uploads and the
Chroma vector database require a persistent disk. Do not use an ephemeral
instance for production data: uploaded PDFs and indexes would disappear after
a restart or redeploy.

For a manual setup instead of a Blueprint, create a Python web service from
`backend` with build command `pip install -r ../requirements.txt`, start command
`uvicorn main:app --host 0.0.0.0 --port $PORT`, and the same environment
variables and persistent-disk mount shown in `render.yaml`. Then create a
static site with build command `cd frontend && npm ci && npm run build`, publish
directory `frontend/dist`, and set `VITE_API_URL` to the API's `https://...onrender.com`
URL before deploying the static site.

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
