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
        alert('Upload failed.');
      }
    } catch (error) {
      alert('Error uploading file.');
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

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg, idx) => {
          const { rawText, chartJson } = parseMessageContent(msg.text);
          return (
            <div key={idx} className={`max-w-[85%] p-4 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end' : 'bg-white text-gray-800 self-start border'}`}>
              
              {/* Render Text and Tables using Markdown */}
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {rawText}
                </ReactMarkdown>
              </div>

              {/* Render Chart if present */}
              {chartJson && <ChartRenderer chartJson={chartJson} />}
              
              {/* Render Sources */}
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
          );
        })}
        {isTyping && <div className="text-sm text-gray-400 italic self-start">Bot is analyzing data...</div>}
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