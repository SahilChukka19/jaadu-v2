import { useState, useEffect, useRef } from 'react'
import './App.css'

const BACKEND_URL = "https://jaadu-v2.onrender.com";
const EXTENSION_KEY = import.meta.env.VITE_EXTENSION_KEY;

const apiFetch = async (endpoint, body) => {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": EXTENSION_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const getPageContent = () =>
  new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return resolve(null);
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_INFO' }, (response) => {
        resolve(response?.fullContent || null);
      });
    });
  });

const App = () => {
  const [activeTab, setActiveTab] = useState('focus');

  // Focus / Summarize
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Explain
  const [explainInput, setExplainInput] = useState('');
  const [explainResult, setExplainResult] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Notes / Collection
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    fetchNotes();
  }, []);

  // Listen for EXPLAIN_SELECTION from background.js
  useEffect(() => {
    const handler = (message) => {
      if (message.type === 'EXPLAIN_SELECTION' && message.text) {
        setExplainInput(message.text);
        setActiveTab('explain');
        handleExplain(message.text);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchNotes = async () => {
    const result = await chrome.storage.local.get(['jaadu_data']);
    setNotes(result.jaadu_data || []);
  };

  // ── Summarize ──────────────────────────────────────────────────────────────
  const handleSummarize = async () => {
    setSummaryLoading(true);
    try {
      const [tab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_INFO' }, async (response) => {
        if (!response) { setSummaryLoading(false); return; }
        const text = response.fullContent || response.summary;
        const data = await apiFetch('/ai/summarize', { text });
        setSummary(data.result);
        setActiveTab('summary');
        setSummaryLoading(false);
      });
    } catch (err) {
      console.error('Summarize error:', err);
      setSummaryLoading(false);
    }
  };

  // ── Explain ────────────────────────────────────────────────────────────────
  const handleExplain = async (textOverride) => {
    const text = textOverride ?? explainInput;
    if (!text.trim()) return;
    setExplainLoading(true);
    setExplainResult('');
    try {
      const data = await apiFetch('/ai/explain', { text });
      setExplainResult(data.result);
    } catch (err) {
      console.error('Explain error:', err);
      setExplainResult('Something went wrong. Please try again.');
    } finally {
      setExplainLoading(false);
    }
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
  const handleChat = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const context = await getPageContent() || 'No page content available.';
      const data = await apiFetch('/ai/chat', { question, context });
      setChatMessages(prev => [...prev, { role: 'assistant', text: data.result }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  const deleteNote = async (id) => {
    const result = await chrome.storage.local.get(['jaadu_data']);
    const updated = (result.jaadu_data || []).filter(n => n.id !== id);
    await chrome.storage.local.set({ jaadu_data: updated });
    setNotes(updated);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="jaadu-container">
      <header className="jaadu-header">
        <h1 className="jaadu-logo">Jaadu</h1>
      </header>

      <nav className="jaadu-tabs">
        {['focus', 'summary', 'explain', 'chat', 'collection'].map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <main className="jaadu-main">

        {/* ── FOCUS ── */}
        {activeTab === 'focus' && (
          <div className="tab-content">
            <button
              className="jaadu-button primary"
              onClick={handleSummarize}
              disabled={summaryLoading}
            >
              {summaryLoading ? 'Analyzing page...' : 'Summarize Current Page'}
            </button>
          </div>
        )}

        {/* ── SUMMARY ── */}
        {activeTab === 'summary' && (
          <div className="tab-content">
            {summary ? (
              <div className="jaadu-card summary-card">
                <h3>Summary</h3>
                <p>{summary}</p>
              </div>
            ) : (
              <div className="empty-state">
                Click "Summarize" from the Focus tab.
              </div>
            )}
          </div>
        )}

        {/* ── EXPLAIN ── */}
        {activeTab === 'explain' && (
          <div className="tab-content explain-tab">
            <textarea
              className="jaadu-textarea"
              placeholder="Paste or type text to explain..."
              value={explainInput}
              onChange={e => setExplainInput(e.target.value)}
              rows={5}
            />
            <button
              className="jaadu-button primary"
              onClick={() => handleExplain()}
              disabled={explainLoading || !explainInput.trim()}
            >
              {explainLoading ? 'Explaining...' : 'Explain'}
            </button>
            {explainResult && (
              <div className="jaadu-card result-card">
                <h3>Explanation</h3>
                <p>{explainResult}</p>
              </div>
            )}
            {!explainResult && !explainLoading && (
              <div className="empty-state">
                Select text on a page and right-click → "Explain with Jaadu", or paste text above.
              </div>
            )}
          </div>
        )}

        {/* ── CHAT ── */}
        {activeTab === 'chat' && (
          <div className="tab-content chat-tab">
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="empty-state">
                  Ask anything about the current page.
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.role}`}>
                  <p>{msg.text}</p>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble assistant loading">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-row">
              <textarea
                className="jaadu-textarea chat-input"
                placeholder="Ask about this page..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={2}
                disabled={chatLoading}
              />
              <button
                className="jaadu-button send-btn"
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
              >
                ↑
              </button>
            </div>
          </div>
        )}

        {/* ── COLLECTION ── */}
        {activeTab === 'collection' && (
          <div className="tab-content">
            {notes.length === 0 ? (
              <div className="empty-state">Your collection is empty.</div>
            ) : (
              notes.map(note => (
                <div key={note.id} className="jaadu-card note-card">
                  <p className="note-content">{note.content || note.summary}</p>
                  <div className="note-meta">
                    <span>{new URL(note.url).hostname}</span>
                    <span>{new Date(note.timestamp).toLocaleDateString()}</span>
                    <button className="delete-btn" onClick={() => deleteNote(note.id)}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
