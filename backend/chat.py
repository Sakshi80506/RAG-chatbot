import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# LangChain imports
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
# If you want to use OpenAI later, uncomment:
# from langchain_openai import ChatOpenAI

# Import the embedding function and DB path we defined in ingest.py
from backend.indest import get_embedding_function, CHROMA_PERSIST_DIRECTORY

load_dotenv()


def get_llm():
    """
    Initializes the LLM.
    Using Groq with LLaMA 3.3 70B (Fast and 100% free tier).
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set in backend/.env")

    return ChatGroq(
        model="openai/gpt-oss-20b",
        temperature=0.2,  # Low temperature = more factual and deterministic
        groq_api_key=api_key
    )
    
    # If using OpenAI instead:
    # return ChatOpenAI(model="gpt-4o-mini", temperature=0.2)


def retrieve_relevant_chunks(
    query: str, 
    doc_id: Optional[str] = None, 
    k: int = 4
) -> List[Document]:
    """
    Step 1: RETRIEVAL
    Embeds the user query and searches ChromaDB for the top-k most similar chunks.
    Allows filtering by doc_id if a specific PDF is selected.
    """
    vector_store = Chroma(
        collection_name="pdf_documents",
        embedding_function=get_embedding_function(),
        persist_directory=CHROMA_PERSIST_DIRECTORY
    )

    # Metadata filtering: search only within a specific document if provided
    filter_dict = {"doc_id": doc_id} if doc_id else None

    # Similarity search converts query -> embedding vector -> finds k nearest neighbors
    results = vector_store.similarity_search(
        query=query,
        k=k,
        filter=filter_dict
    )
    return results


def retrieve_relevant_chunks_with_scores(
    query: str,
    doc_id: Optional[str] = None,
    k: int = 4,
) -> List[Any]:
    """Retrieves chunks with Chroma similarity distances for advanced users."""
    vector_store = Chroma(
        collection_name="pdf_documents",
        embedding_function=get_embedding_function(),
        persist_directory=CHROMA_PERSIST_DIRECTORY
    )
    filter_dict = {"doc_id": doc_id} if doc_id else None
    return vector_store.similarity_search_with_score(query=query, k=k, filter=filter_dict)


def format_context(documents: List[Document]) -> str:
    """
    Step 2: CONTEXT FORMATTING
    Combines retrieved chunks into a single readable string for the prompt,
    tagging each piece with its page number.
    """
    context_parts = []
    for i, doc in enumerate(documents, start=1):
        page_num = doc.metadata.get("page_number", "Unknown")
        source = doc.metadata.get("filename", "Unknown")
        snippet = doc.page_content.strip()
        context_parts.append(f"--- Chunk {i} (Source: {source}, Page: {page_num}) ---\n{snippet}")
    
    return "\n\n".join(context_parts)


def extract_sources(
    documents: List[Document],
    scores: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """
    Helper to extract clean source citations for the UI.
    """
    sources = []
    for index, doc in enumerate(documents):
        source = {
            "filename": doc.metadata.get("filename", "Unknown"),
            "page_number": doc.metadata.get("page_number", "Unknown"),
            "snippet": doc.page_content.strip()
        }
        if scores is not None:
            source["score"] = round(float(scores[index]), 4)
        sources.append(source)
    return sources


def ask_question(
    question: str, 
    doc_id: Optional[str] = None, 
    chat_history: Optional[List[Dict[str, str]]] = None,
    top_k: int = 4,
    show_scores: bool = False,
) -> Dict[str, Any]:
    """
    Step 3: GENERATION
    The full RAG pipeline:
    1. Retrieve relevant chunks.
    2. Format context.
    3. Build prompt with context + history.
    4. Call LLM to generate answer.
    """
    llm = get_llm()
    search_query = question
    formatted_history = ""

    # Reformulate follow-up questions into standalone database queries.
    if chat_history and len(chat_history) > 0:
        history_lines = []
        for msg in chat_history:
            role = "User" if msg.get("role") == "user" else "Assistant"
            history_lines.append(f"{role}: {msg.get('text', '')}")

        formatted_history = "\n".join(history_lines[-4:])
        rewrite_prompt = ChatPromptTemplate.from_messages([
            ("system",
             "Given the chat history and the latest user question, rewrite the user's question into a standalone query that includes all context necessary for a database search. "
             "Do NOT answer the question, ONLY return the rewritten search query. If the question doesn't need context, return it exactly as is."),
            ("human", "Chat History:\n{history}\n\nLatest Question: {question}\n\nStandalone Search Query:")
        ])
        formatted_rewrite = rewrite_prompt.format_messages(
            history=formatted_history,
            question=question
        )
        search_query = llm.invoke(formatted_rewrite).content.strip()
        print(f"\n[Memory] Original: {question}")
        print(f"[Memory] Rewritten for search: {search_query}\n")

    # Retrieve using the standalone query rather than unresolved pronouns.
    top_k = max(1, min(top_k, 12))
    retrieval_results = retrieve_relevant_chunks_with_scores(
        query=search_query,
        doc_id=doc_id,
        k=top_k,
    )
    retrieved_docs = [document for document, score in retrieval_results]
    retrieval_scores = [score for document, score in retrieval_results]
    
    if not retrieved_docs:
        return {
            "answer": "No relevant information found.",
            "sources": []
        }

    # 2. Format context string
    context_text = format_context(retrieved_docs)

    # Include recent history so the answer remains natural and coherent.
    prompt_template = ChatPromptTemplate.from_messages([
        ("system", 
         "You are a helpful data assistant. Answer the user's latest question using ONLY the provided context.\n"
         "You may use the Chat History to understand the flow of the conversation, but your facts must come from the Context.\n\n"
         "FORMATTING RULES:\n"
         "- If the user asks for a TABLE, format it strictly using Markdown tables.\n"
         "- If the user asks for a CHART or GRAPH (bar, line, or pie), extract the numerical data and include a JSON block wrapped EXACTLY in <chart> tags at the end of your response.\n\n"
         "CHART JSON FORMAT EXAMPLE:\n"
         "<chart>\n"
         '{{"type": "bar", "data": [{{"name": "Revenue", "value": 5000}}, {{"name": "Profit", "value": 2000}}]}}\n'
         "</chart>\n\n"
         "Valid chart types are: 'bar', 'line', 'pie'. The data array must contain objects with 'name' (string) and 'value' (number).\n\n"
         "CHAT HISTORY:\n{history}\n\n"
         "CONTEXT:\n{context}"),
        ("human", "{question}")
    ])

    # 4. Fill the template and invoke LLM
    formatted_prompt = prompt_template.format_messages(
        history=formatted_history if formatted_history else "No previous history.",
        context=context_text,
        question=question
    )
    
    llm = get_llm()
    response = llm.invoke(formatted_prompt)

    # 5. Extract citation sources
    sources = extract_sources(
        retrieved_docs,
        retrieval_scores if show_scores else None,
    )

    return {
        "answer": response.content,
        "sources": sources
    }


if __name__ == "__main__":
    """
    Terminal Test Run: Test asking questions against your ingested PDF!
    """
    print("=== Testing RAG Chat Pipeline ===")
    test_question = input("\nEnter a question about your PDF: ")
    
    print("\n[1] Retrieving relevant chunks & generating answer...")
    result = ask_question(test_question)

    print("\n=== ANSWER ===")
    print(result["answer"])

    print("\n=== CITATION SOURCES ===")
    for src in result["sources"]:
        print(f"- {src['filename']} (Page {src['page_number']})")
