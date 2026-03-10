# Jaadu — Frontend

React + Vite Chrome Extension (Manifest V3).

## Build

```bash
npm install
npm run build   # outputs to dist/
```

Load `dist/` as an unpacked extension in `chrome://extensions` with Developer Mode on.

## Environment

Create a `.env` file:

```
VITE_API_URL=https://your-render-backend.onrender.com
VITE_EXTENSION_KEY=your_shared_secret
```
