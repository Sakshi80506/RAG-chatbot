import { useState, useEffect } from 'react';

// The URL where our FastAPI backend is running
const API_URL = 'http://localhost:8000';

function App() {
  // --- STATE MANAGEMENT ---
  // We use React state to keep track of changing data in our UI.
  const [documents, setDocuments] = useState([]); // List of uploaded PDFs
  const [selectedDocId, setSelectedDocId] = useState(''); // Which PDF to chat with
  const [messages, setMessages] = useState([]); // Chat history
  const [inputText, setInputText] = useState(''); // What the user is typing
  const [isUploading, setIsUploading] = useState(false); // Shows a loading spinner during upload
  const [isTyping, setIsTyping] = useState(false); // Shows "Bot is typing..." during chat

  // --- USE EFFECT ---
  // Runs once when the component first loads to fetch the list of already uploaded PDFs
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/documents`);
      const data = await res.json();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    }
  };

  // --- FILE UPLOAD HANDLER ---
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    
    // We must use FormData to send files over HTTP (standard JSON doesn't work for files)
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        // Refresh the dropdown list to include the new file
        await fetchDocuments();
        alert('File uploaded successfully!');
      } else {
        alert('Upload failed.');
      }
    } catch (error) {
      alert('Error uploading file.');
    } finally {
      setIsUploading(false);
      event.target.value = ''; // Reset the file input
    }
  };

  // --- CHAT HANDLER ---
  const sendMessage = async (e) => {
    e.preventDefault(); // Prevents the page from refreshing when you submit the form
    if (!inputText.trim()) return;

    const userMessage = inputText;
    setInputText(''); // Clear input box immediately
    
    // Add user's message to the chat interface
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setIsTyping(true);

    try {
      // Send the question and the selected document ID to FastAPI
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          doc_id: selectedDocId || null, // null means "search all documents"
          chat_history: [] // Left blank for now (stretch goal!)
        }),
      });

      const data = await res.json();

      // Add the bot's response and citation sources to the chat interface
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: data.answer, sources: data.sources }
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'bot', text: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      
      {/* HEADER & UPLOAD SECTION */}
      <header className="bg-white shadow p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-xl font-bold text-blue-600">PDF RAG Chatbot</h1>
        
        <div className="flex items-center gap-4">
          {/* Document Selector Dropdown */}
          <select 
            className="border rounded p-2 text-sm outline-none"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            <option value="">All Documents</option>
            {documents.map((doc) => (
              <option key={doc.doc_id} value={doc.doc_id}>
                {doc.filename}
              </option>
            ))}
          </select>

          {/* Upload Button */}
          <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700 transition text-sm">
            {isUploading ? 'Uploading...' : 'Upload PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
        </div>
      </header>

      {/* CHAT DISPLAY SECTION */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            Upload a PDF and ask a question to get started!
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`max-w-[80%] p-4 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end' : 'bg-white text-gray-800 self-start border'}`}>
            <p className="whitespace-pre-wrap">{msg.text}</p>
            
            {/* Render sources only if they exist and it's a bot message */}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-1">Sources:</p>
                <ul className="text-xs text-gray-500 list-disc pl-4">
                  {msg.sources.map((src, i) => (
                    <li key={i}>Page {src.page_number} ({src.filename})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {isTyping && <div className="text-sm text-gray-400 italic self-start">Bot is analyzing document...</div>}
      </main>

      {/* CHAT INPUT FORM */}
      <footer className="bg-white p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <form onSubmit={sendMessage} className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            className="flex-1 border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask a question about your PDFs..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isTyping}
          />
          <button 
            type="submit" 
            disabled={isTyping || !inputText.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}

export default App;