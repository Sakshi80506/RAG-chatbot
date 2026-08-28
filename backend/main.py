import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Import our custom RAG logic
from indest import ingest_pdf, get_embedding_function, CHROMA_PERSIST_DIRECTORY
from chat import ask_question
from langchain_chroma import Chroma

load_dotenv()

UPLOADS_DIRECTORY = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIRECTORY, exist_ok=True)

app = FastAPI(title="PDF RAG Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. PYDANTIC MODELS (Request & Response Schemas)
# ==========================================

class ChatRequest(BaseModel):
    question: str
    doc_id: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = []

class SourceItem(BaseModel):
    filename: str
    page_number: int
    snippet: str

class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceItem]

class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    total_pages: int
    upload_date: Optional[str] = None
    open_url: str
    file_available: bool


# ==========================================
# 2. ENDPOINTS
# ==========================================

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Accepts a PDF file, temporarily saves it to disk, runs the ingestion pipeline,
    and deletes the temporary file.
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Create a secure temporary file to save the uploaded data
    try:
        # We use delete=False because Windows sometimes locks files if they are open
        original_filename = os.path.basename(file.filename)
        doc_id = uuid.uuid4().hex
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            # Efficiently stream chunks from the network directly to the disk
            shutil.copyfileobj(file.file, tmp_file)
            temp_file_path = tmp_file.name

        if os.path.getsize(temp_file_path) == 0:
            raise HTTPException(status_code=400, detail="The uploaded PDF is empty.")
        
        # Pass the physical file path to our ingestion logic
        result = ingest_pdf(temp_file_path, doc_id=doc_id, filename=original_filename)
        shutil.copy2(temp_file_path, os.path.join(UPLOADS_DIRECTORY, f"{doc_id}.pdf"))
        
        return {
            "message": "File uploaded and ingested successfully",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not process this PDF: {str(e)}")
    
    finally:
        # Cleanup: Always delete the temporary file from the server to save space
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@app.get("/documents", response_model=List[DocumentInfo])
def list_documents():
    """
    Reads ChromaDB metadata to find all uniquely uploaded documents.
    """
    try:
        # Connect to ChromaDB
        vector_store = Chroma(
            collection_name="pdf_documents",
            embedding_function=get_embedding_function(),
            persist_directory=CHROMA_PERSIST_DIRECTORY
        )
        
        # Get all stored metadata
        collection_data = vector_store.get(include=["metadatas"])
        metadatas = collection_data.get("metadatas", [])
        
        # Use a dictionary to filter out duplicate chunks belonging to the same doc
        unique_docs = {}
        for meta in metadatas:
            if not meta:
                continue
            doc_id = meta.get("doc_id")
            if doc_id and doc_id not in unique_docs:
                unique_docs[doc_id] = {
                    "filename": meta.get("filename", "Unknown"),
                    "total_pages": int(meta.get("total_pages", 0)),
                    "upload_date": meta.get("upload_date"),
                }

        # Format for our Pydantic response model
        docs_list = [
            {
                "doc_id": doc_id,
                "filename": details["filename"],
                "total_pages": details["total_pages"],
                "upload_date": details["upload_date"] or get_document_upload_date(
                    doc_id, details["filename"]
                ),
                "open_url": f"/documents/{doc_id}/file",
                "file_available": os.path.isfile(
                    os.path.join(UPLOADS_DIRECTORY, f"{doc_id}.pdf")
                ) or os.path.isfile(
                    os.path.join(os.path.dirname(__file__), details["filename"])
                ),
            }
            for doc_id, details in unique_docs.items()
        ]
        return docs_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving documents: {str(e)}")


def get_document_upload_date(doc_id: str, filename: str) -> Optional[str]:
    """Uses the PDF file timestamp for documents created before metadata tracking."""
    archived_path = os.path.join(UPLOADS_DIRECTORY, f"{doc_id}.pdf")
    legacy_path = os.path.join(os.path.dirname(__file__), os.path.basename(filename))
    file_path = archived_path if os.path.isfile(archived_path) else legacy_path
    if not os.path.isfile(file_path):
        return None
    return datetime.fromtimestamp(
        os.path.getctime(file_path), timezone.utc
    ).isoformat()


@app.get("/documents/{doc_id}/file")
def open_document(doc_id: str):
    """Returns the original PDF for viewing in the browser."""
    file_path = os.path.join(UPLOADS_DIRECTORY, f"{doc_id}.pdf")
    if not os.path.isfile(file_path):
        try:
            vector_store = Chroma(
                collection_name="pdf_documents",
                embedding_function=get_embedding_function(),
                persist_directory=CHROMA_PERSIST_DIRECTORY
            )
            collection_data = vector_store.get(
                where={"doc_id": doc_id},
                include=["metadatas"],
            )
            metadata = next(iter(collection_data.get("metadatas", [])), None)
            if metadata:
                legacy_path = os.path.join(
                    os.path.dirname(__file__),
                    os.path.basename(metadata.get("filename", "")),
                )
                if os.path.isfile(legacy_path):
                    file_path = legacy_path
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error locating PDF: {str(e)}")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="PDF file is not available.")
    return FileResponse(file_path, media_type="application/pdf")


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    """Deletes a document's vectors and its archived PDF."""
    try:
        vector_store = Chroma(
            collection_name="pdf_documents",
            embedding_function=get_embedding_function(),
            persist_directory=CHROMA_PERSIST_DIRECTORY
        )
        vector_store.delete(where={"doc_id": doc_id})

        file_path = os.path.join(UPLOADS_DIRECTORY, f"{doc_id}.pdf")
        if os.path.isfile(file_path):
            os.remove(file_path)

        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")


@app.post("/chat", response_model=ChatResponse)
def chat_with_document(request: ChatRequest):
    """
    Takes a user question and an optional doc_id, runs the RAG pipeline, 
    and returns the LLM's answer along with citation sources.
    """
    try:
        # Call our Phase 3 logic
        result = ask_question(
            question=request.question,
            doc_id=request.doc_id,
            chat_history=request.chat_history
        )
        
        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating answer: {str(e)}")