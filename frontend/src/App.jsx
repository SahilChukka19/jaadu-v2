import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
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
  const [activeTab, setActiveTab] = useState('summarize');

  // Summarize
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryUrl, setSummaryUrl] = useState('');
  const [summaryTitle, setSummaryTitle] = useState('');
  const [summarySaved, setSummarySaved] = useState(false);

  // Explain
  const [explainInput, setExplainInput] = useState('');
  const [explainResult, setExplainResult] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainSaved, setExplainSaved] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Notes / Collection
  const [notes, setNotes] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState({});

  useEffect(() => {
    fetchNotes();
  }, []);

  // Refresh collection when switching to it
  useEffect(() => {
    if (activeTab === 'collection') fetchNotes();
  }, [activeTab]);

  // Listen for messages from background.js
  useEffect(() => {
    const handler = (message) => {
      if (message.type === 'EXPLAIN_SELECTION' && message.text) {
        setExplainInput(message.text);
        setActiveTab('explain');
        handleExplain(message.text);
      }
      if (message.type === 'DATA_UPDATED') {
        fetchNotes();
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
    setSummary('');
    setSummarySaved(false);
    try {
      const [tab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
      setSummaryUrl(tab.url || '');
      setSummaryTitle(tab.title || '');
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_INFO' }, async (response) => {
        if (!response) { setSummaryLoading(false); return; }
        const text = response.fullContent || response.summary;
        const data = await apiFetch('/ai/summarize', { text });
        setSummary(data.result);
        setSummaryLoading(false);
      });
    } catch (err) {
      console.error('Summarize error:', err);
      setSummaryLoading(false);
    }
  };

  const saveSummary = async () => {
    const item = {
      id: Date.now(),
      type: 'page',
      content: summary,
      title: summaryTitle,
      url: summaryUrl || 'unknown',
      timestamp: new Date().toISOString(),
    };
    const result = await chrome.storage.local.get(['jaadu_data']);
    const data = result.jaadu_data || [];
    data.push(item);
    await chrome.storage.local.set({ jaadu_data: data });
    fetchNotes();
    setSummarySaved(true);
    setTimeout(() => setSummarySaved(false), 2000);
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

  const saveExplanation = async () => {
    const item = {
      id: Date.now(),
      type: 'note',
      content: `**Input:**\n${explainInput}\n\n**Explanation:**\n${explainResult}`,
      url: 'unknown',
      timestamp: new Date().toISOString(),
    };
    // Try to attach current page URL
    try {
      const [tab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
      if (tab?.url) item.url = tab.url;
    } catch { /* ignore */ }
    const result = await chrome.storage.local.get(['jaadu_data']);
    const data = result.jaadu_data || [];
    data.push(item);
    await chrome.storage.local.set({ jaadu_data: data });
    fetchNotes();
    setExplainSaved(true);
    setTimeout(() => setExplainSaved(false), 2000);
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

  const clearAllNotes = async () => {
    await chrome.storage.local.set({ jaadu_data: [] });
    setNotes([]);
    setExpandedNotes({});
  };

  const toggleExpand = (id) => {
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="jaadu-container">
      <header className="jaadu-header">
        <h1 className="jaadu-logo">Jaadu</h1>
      </header>

      <nav className="jaadu-tabs">
        {['summarize', 'explain', 'chat', 'collection'].map(tab => (
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

        {/* ── SUMMARIZE ── */}
        {activeTab === 'summarize' && (
          <div className="tab-content">
            <button
              className="jaadu-button primary"
              onClick={handleSummarize}
              disabled={summaryLoading}
            >
              {summaryLoading ? 'Analyzing page...' : 'Summarize Current Page'}
            </button>
            {summaryLoading && (
              <div className="empty-state">Reading page content...</div>
            )}
            {summary && !summaryLoading && (
              <div className="jaadu-card summary-card">
                <h3>Summary</h3>
                <div className="markdown-body">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>
            )}
            {summary && !summaryLoading && (
              <button
                className={`jaadu-button save-summary-btn ${summarySaved ? 'saved' : ''}`}
                onClick={saveSummary}
                disabled={summarySaved}
              >
                {summarySaved ? 'Saved to Collection ✓' : 'Save to Collection'}
              </button>
            )}
            {!summary && !summaryLoading && (
              <div className="empty-state">
                Click the button above to summarize the current page.
              </div>
            )}
          </div>
        )}

        {/* ── EXPLAIN ── */}
        {activeTab === 'explain' && (
          <div className="tab-content explain-tab">
            <div className="textarea-wrapper">
              <textarea
                className="jaadu-textarea"
                placeholder="Paste or type text to explain..."
                value={explainInput}
                onChange={e => {
                  if (e.target.value.length <= 3000) setExplainInput(e.target.value);
                }}
                rows={5}
              />
              <span className={`char-counter ${explainInput.length > 2400 ? 'warn' : ''} ${explainInput.length >= 3000 ? 'over' : ''}`}>
                {explainInput.length} / 3000
              </span>
            </div>
            <button
              className="jaadu-button primary"
              onClick={() => handleExplain()}
              disabled={explainLoading || !explainInput.trim() || explainInput.length > 3000}
            >
              {explainLoading ? 'Explaining...' : 'Explain'}
            </button>
            {explainResult && (
              <div className="jaadu-card result-card">
                <h3>Explanation</h3>
                <div className="markdown-body">
                  <ReactMarkdown>{explainResult}</ReactMarkdown>
                </div>
              </div>
            )}
            {explainResult && (
              <button
                className={`jaadu-button save-summary-btn ${explainSaved ? 'saved' : ''}`}
                onClick={saveExplanation}
                disabled={explainSaved}
              >
                {explainSaved ? 'Saved to Collection ✓' : 'Save to Collection'}
              </button>
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
              <div className="empty-state">Your collection is empty.<br />Right-click on any page to save notes.</div>
            ) : (
              <>
                <div className="collection-header">
                  <span className="collection-count">{notes.length} item{notes.length !== 1 ? 's' : ''}</span>
                  <button className="clear-all-btn" onClick={clearAllNotes}>Clear all</button>
                </div>
                {[...notes].reverse().map(note => {
                  const content = note.content || note.summary || '';
                  const isLong = content.length > 160;
                  const isExpanded = expandedNotes[note.id];
                  let hostname = '';
                  try { hostname = new URL(note.url).hostname; } catch { }
                  return (
                    <div key={note.id} className="jaadu-card note-card">
                      <div className="note-type-badge">{note.type === 'page' ? '📄 Page' : '📝 Note'}</div>
                      <div className={`markdown-body note-markdown ${isLong && !isExpanded ? 'note-collapsed' : ''}`}>
                        <ReactMarkdown>{content}</ReactMarkdown>
                      </div>
                      {isLong && (
                        <button className="expand-btn" onClick={() => toggleExpand(note.id)}>
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                      <div className="note-meta">
                        {hostname && (
                          <a href={note.url} target="_blank" rel="noopener" className="note-url">{hostname}</a>
                        )}
                        <span>{new Date(note.timestamp).toLocaleDateString()}</span>
                        <button className="delete-btn" onClick={() => deleteNote(note.id)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
