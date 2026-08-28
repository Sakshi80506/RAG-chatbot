import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

const API_URL = 'http://localhost:8000';

// Colors for the Pie Chart
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

// --- CUSTOM CHART RENDERER COMPONENT ---
const ChartRenderer = ({ chartJson }) => {
  try {
    const config = JSON.parse(chartJson);
    const { type, data } = config;

    if (!data || data.length === 0) return null;

    const chartHeight = 300;

    return (
      <div className="bg-white p-4 rounded-lg border mt-4 mb-2 shadow-sm w-full h-[350px]">
        <ResponsiveContainer width="100%" height={chartHeight}>
          {type === 'bar' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : (
            <p className="text-red-500">Unsupported chart type: {type}</p>
          )}
        </ResponsiveContainer>
      </div>
    );
  } catch (error) {
    return <div className="text-red-500 border p-2 text-sm mt-2">Failed to render chart: Invalid data format.</div>;
  }
};

// --- MAIN APP ---
function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [deletingDocId, setDeletingDocId] = useState(null);

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
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const openDocument = (doc) => {
    if (!doc.file_available) {
      alert('This PDF is not available. Please upload it again to view it.');
      return;
    }
    window.open(`${API_URL}${doc.open_url}`, '_blank', 'noopener,noreferrer');
  };

  const deleteDocument = async (doc) => {
    if (!window.confirm(`Delete ${doc.filename}? This cannot be undone.`)) return;

    setDeletingDocId(doc.doc_id);
    try {
      const res = await fetch(`${API_URL}/documents/${doc.doc_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      if (selectedDocId === doc.doc_id) setSelectedDocId('');
      await fetchDocuments();
    } catch (error) {
      alert('Unable to delete the document.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const formatUploadDate = (uploadDate) => {
    if (!uploadDate) return 'Date unavailable';
    return new Date(uploadDate).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      if (res.ok) {
        await fetchDocuments();
        alert('File uploaded successfully!');
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.detail || 'Upload failed.');
      }
    } catch (error) {
      alert('Unable to reach the backend. Make sure the API server is running.');
    } finally {
      setIsUploading(false);
      event.target.value = ''; 
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const userMessage = inputText;
    setInputText(''); 
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setIsTyping(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          doc_id: selectedDocId || null,
          chat_history: [] 
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'bot', text: data.answer, sources: data.sources }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'bot', text: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Helper to extract the chart JSON from the LLM's text response
  const parseMessageContent = (text) => {
    // Regex to find <chart>...</chart> blocks
    const chartRegex = /<chart>([\s\S]*?)<\/chart>/;
    const match = text.match(chartRegex);
    
    if (match) {
      const rawText = text.replace(match[0], ''); // Remove the tag from the text
      const chartJson = match[1].trim(); // Extract the JSON inside
      return { rawText, chartJson };
    }
    return { rawText: text, chartJson: null };
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="bg-white shadow p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-xl font-bold text-blue-600">Analytics RAG Chatbot</h1>
        <div className="flex items-center gap-4">
          <select 
            className="border rounded p-2 text-sm outline-none"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            <option value="">All Documents</option>
            {documents.map((doc) => (
              <option key={doc.doc_id} value={doc.doc_id}>{doc.filename}</option>
            ))}
          </select>
          <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700 transition text-sm">
            {isUploading ? 'Uploading...' : 'Upload PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col lg:flex-row gap-4">
        <aside className="w-full lg:w-72 shrink-0 bg-white border rounded-lg shadow-sm p-4 flex flex-col max-h-64 lg:max-h-none">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-800">Uploaded documents</h2>
              <p className="text-xs text-gray-500 mt-1">{documents.length} {documents.length === 1 ? 'file' : 'files'}</p>
            </div>
            <button type="button" onClick={fetchDocuments} className="text-xs text-blue-600 hover:text-blue-800" title="Refresh document list">
              Refresh
            </button>
          </div>
          <div className="overflow-y-auto space-y-2">
            {isLoadingDocuments && <p className="text-sm text-gray-400">Loading documents...</p>}
            {!isLoadingDocuments && documents.length === 0 && <p className="text-sm text-gray-400">No PDFs uploaded yet.</p>}
            {documents.map((doc) => (
              <div key={doc.doc_id} className="border rounded-md p-3">
                <p className="text-sm font-medium text-gray-700 truncate" title={doc.filename}>{doc.filename}</p>
                <p className="text-xs text-gray-500 mt-1">{doc.total_pages || '—'} pages · Uploaded {formatUploadDate(doc.upload_date)}</p>
                <div className="flex items-center gap-3 mt-2">
                  <button type="button" onClick={() => openDocument(doc)} disabled={!doc.file_available} className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed" title={doc.file_available ? 'Open PDF' : 'PDF unavailable; upload it again'}>
                    {doc.file_available ? 'Open PDF' : 'Unavailable'}
                  </button>
                  <button type="button" onClick={() => deleteDocument(doc)} disabled={deletingDocId === doc.doc_id} className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:text-gray-400">
                    {deletingDocId === doc.doc_id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 min-w-0 overflow-y-auto flex flex-col gap-4">
          {messages.map((msg, idx) => {
            const { rawText, chartJson } = parseMessageContent(msg.text);
            return (
              <div key={idx} className={`max-w-[85%] p-4 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end' : 'bg-white text-gray-800 self-start border'}`}>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawText}</ReactMarkdown>
                </div>
                {chartJson && <ChartRenderer chartJson={chartJson} />}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Sources:</p>
                    <ul className="text-xs text-gray-500 list-disc pl-4">
                      {msg.sources.map((src, i) => <li key={i}>Page {src.page_number} ({src.filename})</li>)}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
          {isTyping && <div className="text-sm text-gray-400 italic self-start">Bot is analyzing data...</div>}
        </section>
      </main>

      <footer className="bg-white p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <form onSubmit={sendMessage} className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            className="flex-1 border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask for a summary, a table, or a pie chart..."
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