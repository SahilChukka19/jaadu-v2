import { useState, useEffect } from 'react'
import './App.css'

const App = () => {
  const [activeTab, setActiveTab] = useState('focus');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState(null);

  useEffect(() => {
    fetchData();
    updateMediaState();
    const interval = setInterval(updateMediaState, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    const result = await chrome.storage.local.get(['jaadu_data']);
    setNotes(result.jaadu_data || []);
  };

  const updateMediaState = async () => {
    try {
      chrome.runtime.sendMessage(
        { type: 'GET_MEDIA_STATE' },
        (response) => {
          if (chrome.runtime.lastError) {
            setMedia(null);
            return;
          }
          setMedia(response || null);
        }
      );
    } catch {
      setMedia(null);
    }
  };

  const togglePlayback = () => {
    if (media) {
      chrome.runtime.sendMessage({ type: 'TOGGLE_MEDIA', tabId: media.tabId }, () => {
        updateMediaState();
      });
    }
  };

  const handleSummarize = async () => {
    setLoading(true);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'EXTRACT_PAGE_INFO' },
        (response) => {
          if (chrome.runtime.lastError) {
            setLoading(false);
            return;
          }

          if (response) {
            setSummary(response.summary);
          }
          setLoading(false);
        }
      );
    } catch {
      setLoading(false);
    }
  };


  return (
    <div className="jaadu-container">
      <header className="jaadu-header">
        <h1 className="jaadu-logo">Jaadu</h1>
      </header>

      <nav className="jaadu-tabs">
        <button
          className={activeTab === 'focus' ? 'active' : ''}
          onClick={() => setActiveTab('focus')}
        >
          Focus
        </button>
        <button
          className={activeTab === 'summary' ? 'active' : ''}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={activeTab === 'collection' ? 'active' : ''}
          onClick={() => setActiveTab('collection')}
        >
          Collection
        </button>
      </nav>

      <main className="jaadu-main">
        {activeTab === 'focus' && (
          <div className="tab-content">
            {media && (
              <div className="jaadu-card media-card">
                <div className="media-info">
                  <span className="media-label">NOW PLAYING</span>
                  <p className="media-title">{media.title.split(' - ')[0]}</p>
                </div>
                <button className="media-control" onClick={togglePlayback}>
                  {media.isPlaying ? '⏸' : '▶'}
                </button>
              </div>
            )}

            <button
              className="jaadu-button primary"
              onClick={handleSummarize}
              disabled={loading}
            >
              {loading ? 'Analyzing page...' : 'Summarize Current Page'}
            </button>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="tab-content">
            {summary ? (
              <div className="jaadu-card summary-card">
                <h3>Summary</h3>
                <p>{summary}</p>
              </div>
            ) : (
              <div className="empty-state">
                Click “Summarize” from the Focus tab.
              </div>
            )}
          </div>
        )}

        {activeTab === 'collection' && (
          <div className="tab-content">
            {notes.length === 0 ? (
              <div className="empty-state">
                Your collection is empty.
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="jaadu-card note-card">
                  <p className="note-content">
                    {note.content || note.summary}
                  </p>
                  <div className="note-meta">
                    <span>{new URL(note.url).hostname}</span>
                    <span>
                      {new Date(note.timestamp).toLocaleDateString()}
                    </span>
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
