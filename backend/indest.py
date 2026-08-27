import os
import uuid
from typing import List
from dotenv import load_dotenv

# LangChain modular imports
from langchain_community.document_loaders import PyPDFLoader  # <--- This is the import that was missing!
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings      # <--- Updated for Hugging Face
from langchain_chroma import Chroma
from langchain_core.documents import Document

# Load environment variables (if any)
load_dotenv()

# Define where ChromaDB will persist its data on disk
CHROMA_PERSIST_DIRECTORY = os.path.join(os.path.dirname(__file__), "chroma_db")


def get_embedding_function() -> HuggingFaceEmbeddings:
    """
    Initializes the Hugging Face embedding model.
    Using all-MiniLM-L6-v2: It's fast, free, and runs locally on your CPU.
    Produces 384-dimensional vectors.
    """
    print("Loading HuggingFace embedding model (this may take a moment the first time)...")
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )


def get_vector_store() -> Chroma:
    """
    Returns an instance of ChromaDB pointing to our local persist directory.
    Using a persistent directory ensures vectors survive server restarts.
    """
    return Chroma(
        collection_name="pdf_documents",
        embedding_function=get_embedding_function(),
        persist_directory=CHROMA_PERSIST_DIRECTORY
    )


def ingest_pdf(file_path: str, doc_id: str = None) -> dict:
    """
    Full Ingestion Pipeline:
    1. Loads PDF page-by-page.
    2. Chunks text while retaining page numbers.
    3. Attaches custom metadata (doc_id, filename).
    4. Embeds and stores chunks in ChromaDB.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Generate a unique document ID if not provided
    if not doc_id:
        doc_id = str(uuid.uuid4())

    filename = os.path.basename(file_path)
    print(f"\n[1/4] Loading PDF: {filename}...")

    # Step 1: Load PDF pages using PyPDFLoader
    loader = PyPDFLoader(file_path)
    raw_pages: List[Document] = loader.load()
    print(f"      Extracted {len(raw_pages)} page(s).")

    # Step 2: Chunk the documents
    print(f"[2/4] Splitting text into semantic chunks...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=3200,          # approx ~800 tokens
        chunk_overlap=400,        # approx ~100 tokens
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    chunks: List[Document] = text_splitter.split_documents(raw_pages)
    print(f"      Created {len(chunks)} chunk(s).")

    # Step 3: Attach custom metadata to every chunk
    print(f"[3/4] Attaching metadata to chunks...")
    for chunk in chunks:
        chunk.metadata["doc_id"] = doc_id
        chunk.metadata["filename"] = filename
        if "page" in chunk.metadata:
            chunk.metadata["page_number"] = chunk.metadata["page"] + 1

    # Step 4: Embed & Store in ChromaDB
    print(f"[4/4] Generating embeddings and storing in ChromaDB...")
    vector_store = get_vector_store()
    vector_store.add_documents(chunks)
    print(f"      Successfully saved to vector store!")

    return {
        "doc_id": doc_id,
        "filename": filename,
        "total_pages": len(raw_pages),
        "total_chunks": len(chunks)
    }


if __name__ == "__main__":
    """
    Standalone test run
    """
    # Create a test PDF if you don't have one, or provide a path to an existing PDF
    sample_pdf_path = "sample_test.pdf"

    if not os.path.exists(sample_pdf_path):
        print(f"\nPlease put a sample PDF named '{sample_pdf_path}' in the backend folder to test.")
    else:
        result = ingest_pdf(sample_pdf_path)
        print("\n--- Ingestion Result ---")
        print(result)