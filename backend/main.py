import os
import shutil
import tempfile
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Import our custom RAG logic
from indest import ingest_pdf, get_embedding_function, CHROMA_PERSIST_DIRECTORY
from chat import ask_question
from langchain_chroma import Chroma

load_dotenv()

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
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Create a secure temporary file to save the uploaded data
    try:
        # We use delete=False because Windows sometimes locks files if they are open
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            # Efficiently stream chunks from the network directly to the disk
            shutil.copyfileobj(file.file, tmp_file)
            temp_file_path = tmp_file.name
        
        # Pass the physical file path to our ingestion logic
        result = ingest_pdf(temp_file_path)
        
        return {
            "message": "File uploaded and ingested successfully",
            "data": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
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
                unique_docs[doc_id] = meta.get("filename", "Unknown")

        # Format for our Pydantic response model
        docs_list = [{"doc_id": k, "filename": v} for k, v in unique_docs.items()]
        return docs_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving documents: {str(e)}")


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