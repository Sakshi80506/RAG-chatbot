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

const AnalyticsDashboard = ({ documents }) => {
  const chartData = documents.map((document) => ({
    name: document.filename,
    value: 1,
  }));

  return (
    <section className="mb-5">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Workspace overview</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Analytics dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">A clear view of your document library and activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">PDFs uploaded</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{documents.length}</p>
          <p className="mt-1 text-xs text-slate-400">Available in this workspace</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total pages</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{documents.reduce((total, document) => total + (document.total_pages || 0), 0)}</p>
          <p className="mt-1 text-xs text-slate-400">Across all uploaded PDFs</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">1</p>
          <p className="mt-1 text-xs text-slate-400">Current workspace user</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Document distribution</h3>
            <p className="mt-1 text-xs text-slate-500">Each slice represents one uploaded PDF.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{documents.length} total</span>
        </div>
        {chartData.length > 0 ? (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={() => ['1 PDF', 'Uploaded']} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">Upload a PDF to see the chart.</div>
        )}
      </div>
    </section>
  );
};

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
  const [activeSection, setActiveSection] = useState('home');
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rag-chat-sessions') || '[]');
    } catch (error) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('rag-chat-sessions', JSON.stringify(chatSessions));
  }, [chatSessions]);

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

  const startNewChat = () => {
    setMessages([]);
    setInputText('');
    setSelectedDocId('');
    setActiveSection('home');
  };

  const saveMessageToHistory = (userText, botMessage) => {
    const document = documents.find((item) => item.doc_id === selectedDocId);
    const now = new Date();
    const newMessages = [
      { role: 'user', text: userText },
      botMessage,
    ];
    setChatSessions((previous) => {
      const existingSession = previous.find((session) => session.docId === (selectedDocId || null));
      if (!existingSession) {
        return [{
          id: crypto.randomUUID(),
          date: now.toISOString(),
          docId: selectedDocId || null,
          docName: document?.filename || 'All documents',
          messages: newMessages,
        }, ...previous];
      }

      return previous.map((session) => session.id === existingSession.id
        ? {
          ...session,
          date: now.toISOString(),
          docName: document?.filename || session.docName,
          messages: [...session.messages, ...newMessages],
        }
        : session);
    });
  };

  const openChatSession = (session) => {
    setMessages(session.messages);
    setSelectedDocId(session.docId || '');
    setActiveSection('chat');
  };

  const groupedSessions = Object.values([...chatSessions]
    .sort((first, second) => new Date(first.date) - new Date(second.date))
    .reduce((sessionsByDocument, session) => {
    const documentKey = session.docId || 'all-documents';
    const existingSession = sessionsByDocument[documentKey];
    sessionsByDocument[documentKey] = existingSession
      ? {
        ...existingSession,
        date: new Date(session.date) > new Date(existingSession.date) ? session.date : existingSession.date,
        messages: [...existingSession.messages, ...session.messages],
      }
      : { ...session };
    return sessionsByDocument;
    }, {})).sort((first, second) => new Date(second.date) - new Date(first.date));

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
      const historyPayload = messages.map((msg) => ({
        role: msg.role,
        text: msg.text,
      }));

      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          doc_id: selectedDocId || null,
          chat_history: historyPayload
        }),
      });
      const data = await res.json();
      const botMessage = { role: 'bot', text: data.answer, sources: data.sources };
      setMessages((prev) => [...prev, botMessage]);
      saveMessageToHistory(userMessage, botMessage);
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
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics <span className="text-blue-600">RAG</span></h1>
          <div className="flex items-center gap-3">
          <select 
            className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm outline-none focus:border-blue-500"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
          >
            <option value="">All Documents</option>
            {documents.map((doc) => (
              <option key={doc.doc_id} value={doc.doc_id}>{doc.filename}</option>
            ))}
          </select>
          <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            {isUploading ? 'Uploading...' : 'Upload PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3">
          {[
            ['home', 'Home'],
            ['documents', `PDFs uploaded (${documents.length})`],
            ['history', `Chat history (${chatSessions.length})`],
          ].map(([section, label]) => (
            <button type="button" key={section} onClick={() => setActiveSection(section)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${activeSection === section ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col lg:flex-row gap-4">
        {activeSection === 'documents' && <aside className="w-full bg-white border rounded-lg shadow-sm p-4 flex flex-col max-h-full">
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
        </aside>}

        {activeSection === 'history' && <section className="flex-1 min-w-0 overflow-y-auto bg-white border rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Chat history</h2>
              <p className="text-sm text-gray-500">Conversations grouped by date and PDF.</p>
            </div>
            <button type="button" onClick={startNewChat} className="text-sm font-semibold text-blue-600 hover:text-blue-800">New chat</button>
          </div>
          {chatSessions.length === 0 && <p className="text-sm text-gray-400">No chat history yet.</p>}
          <div className="space-y-2">
            {groupedSessions.map((session) => (
              <button type="button" key={session.docId || 'all-documents'} onClick={() => openChatSession(session)} className="w-full border rounded-md p-3 text-left hover:border-blue-400 hover:bg-blue-50">
                <p className="text-sm font-medium text-gray-800">{session.docName}</p>
                <p className="text-xs text-gray-500 mt-1">{session.messages.length / 2} questions · Last active {new Date(session.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="mt-2 truncate text-xs text-slate-600">{session.messages[session.messages.length - 2]?.text || 'No questions yet'}</p>
              </button>
            ))}
          </div>
        </section>}

        {(activeSection === 'home' || activeSection === 'chat') && <section className="flex-1 min-w-0 overflow-y-auto">
          {activeSection === 'home' && <AnalyticsDashboard documents={documents} />}
          {activeSection === 'chat' && <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Saved conversation</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{documents.find((document) => document.doc_id === selectedDocId)?.filename || 'All documents'}</h2>
            </div>
            <button type="button" onClick={() => setActiveSection('history')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Back to history</button>
          </div>}
          <div className="flex flex-col gap-4">
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
          </div>
        </section>}
      </main>
      </div>

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