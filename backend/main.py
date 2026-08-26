from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# load_dotenv() looks for a .env file in the current directory and loads 
# its contents into the system environment variables. This is how we 
# safely access OPENAI_API_KEY later.
load_dotenv()

# Initialize the FastAPI app instance
app = FastAPI(
    title="PDF RAG Chatbot API",
    description="API for uploading PDFs and chatting with them using OpenAI and ChromaDB."
)

# Add CORS middleware to allow requests from the React frontend.
# The frontend will likely run on localhost:5173 (Vite's default).
# Using ["*"] allows all origins, which is fine for local development, 
# but should be locked down to your Vercel URL in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define a simple GET endpoint to test if our API is alive.
@app.get("/health")
def health_check():
    """
    A simple endpoint to verify the backend is running.
    """
    return {"status": "ok", "message": "Backend is up and running!"}