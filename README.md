# Jaadu: Web Co-Pilot — Chrome Extension

> A personal AI assistant that lives in your browser. Summarize pages, explain selected text, and chat with any webpage — powered by Google Gemini 2.5 Flash.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Summarize** | Extracts and summarizes the current page into clear bullet points |
| **Explain** | Paste or right-click selected text to get a simple explanation (max 3000 chars) |
| **Chat** | Ask questions about the page you're on |
| **Collection** | Save summaries, explanations, and notes for later review |
| **Context Menu** | Right-click → Save note, Save page, or Explain with Jaadu |

---

## 🏗 Architecture

```
┌─────────────────────────────────┐
│   Chrome Extension (frontend/)  │
│   React 19 + Vite 7 (MV3)      │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │  Popup   │  │Content Scr. │  │
│  │ (App.jsx)│  │(content.js) │  │
│  └────┬─────┘  └──────┬──────┘  │
│       │               │         │
│  ┌────▼───────────────▼──────┐  │
│  │   Background Service      │  │
│  │   Worker (background.js)  │  │
│  └────────────┬──────────────┘  │
└───────────────┼─────────────────┘
                │ HTTPS + x-extension-key header
┌───────────────▼─────────────────┐
│   Backend (backend/)            │
│   FastAPI + Python              │
│   Deployed on Render            │
│                                 │
│        ┌────────────────┐       │
│        │  Google Gemini │       │
│        │  (2.5 Flash)   │       │
│        └────────────────┘       │
└─────────────────────────────────┘
```

---

## 📁 Project Structure

```
jaadu-v2/
├── frontend/                   # Chrome extension (React 19 + Vite 7)
│   ├── src/
│   │   ├── App.jsx             # Main popup UI (tabs, state, API calls)
│   │   ├── App.css             # Styles (glassmorphism, Nunito font)
│   │   ├── background.js       # Service worker (context menus, storage)
│   │   └── content.js          # Injected FAB + overlay (Shadow DOM)
│   ├── public/
│   │   └── manifest.json       # Extension manifest (MV3)
│   └── dist/                   # Built extension — load this in Chrome
│
├── backend/                    # FastAPI server
│   ├── main.py                 # API endpoints + auth + rate limiting
│   ├── requirements.txt        # fastapi, uvicorn, google-genai, slowapi, etc.
│   └── .env                    # GEMINI_API_KEY, EXTENSION_API_KEY (gitignored)
│
├── docs/                       # GitHub Pages (privacy policy, terms)
│   ├── index.html
│   ├── privacy.html
│   └── terms.html
│
└── .gitignore
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini 2.5 Flash)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Create .env
echo GEMINI_API_KEY=your_gemini_key >> .env
echo EXTENSION_API_KEY=your_secret >> .env

uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install

# Create .env
echo VITE_API_URL=http://localhost:8000 >> .env
echo VITE_EXTENSION_KEY=your_secret >> .env    # same as EXTENSION_API_KEY

npm run build
# Output: frontend/dist/
```

Then in Chrome: `chrome://extensions` → Enable **Developer Mode** → **Load unpacked** → select `frontend/dist/`

---

## 🔌 API Endpoints

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/` | — | Health check |
| `POST` | `/ai/summarize` | `{ text }` | Summarize page text (max 8000 chars) |
| `POST` | `/ai/explain` | `{ text }` | Explain selected text (max 3000 chars) |
| `POST` | `/ai/chat` | `{ question, context }` | Chat with page context |

**All endpoints require:**
- `x-extension-key: <EXTENSION_API_KEY>` header
- `Origin: chrome-extension://...` header

Rate limited to **20 requests/minute** per IP.

---

## 🔒 Security

- API key injected at build time via Vite env vars (`VITE_EXTENSION_KEY`) — never hardcoded
- Backend validates `chrome-extension://` origin on every request
- Optional: lock to a specific extension ID via `ALLOWED_EXTENSION_ID` env var
- Input limits enforced on both frontend and backend (Pydantic `max_length`)
- Rate limiting via `slowapi`

---

## 🛠 Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 19, Vite 7, Manifest V3, react-markdown, Shadow DOM |
| **Backend** | FastAPI, Python, google-genai SDK, slowapi |
| **AI Model** | Google Gemini 2.5 Flash |
| **Hosting** | Render (backend), Chrome (extension loaded unpacked) |
| **Storage** | `chrome.storage.local` (notes collection, no server-side storage) |

---

## 📝 Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GEMINI_API_KEY` | `backend/.env` | Google AI Studio API key |
| `EXTENSION_API_KEY` | `backend/.env` + `frontend/.env` | Shared secret between extension and backend |
| `VITE_API_URL` | `frontend/.env` | Backend base URL |
| `VITE_EXTENSION_KEY` | `frontend/.env` | Same value as `EXTENSION_API_KEY` |
| `ALLOWED_EXTENSION_ID` | `backend/.env` *(optional)* | Restrict backend to one specific extension ID |

---

## 🧩 Chrome Extension Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read current tab URL and title |
| `scripting` | Inject content script |
| `contextMenus` | Right-click menu (Save, Explain) |
| `storage` | Save notes to `chrome.storage.local` |
| `tabs` | Query active tab for page content |
| `<all_urls>` (host) | Inject FAB overlay on all pages |
