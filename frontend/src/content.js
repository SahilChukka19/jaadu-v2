// Jaadu Content Script - Floating UI Controller
console.log("Jaadu: Content script starting...");

const isContextValid = () => {
  try {
    return chrome.runtime && !!chrome.runtime.getManifest();
  } catch {
    return false;
  }
};

let isVisible = false;

// Create and inject the Jaadu Container
const injectJaadu = () => {
  if (!isContextValid()) return;

  console.log("Jaadu: Attempting injection...");

  if (document.getElementById('jaadu-root')) {
    console.log("Jaadu: Already injected.");
    return;
  }

  if (!document.body) {
    console.log("Jaadu: document.body not found, retrying...");
    setTimeout(injectJaadu, 100);
    return;
  }

  const container = document.createElement('div');
  container.id = 'jaadu-root';

  // Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #jaadu-fab {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #1D1D1F;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      z-index: 2147483647;
      font-family: -apple-system, system-ui, sans-serif;
      font-weight: 800;
      font-size: 26px;
      transition: transform 0.25s ease;
      user-select: none;
      border: 2px solid white;
    }
    #jaadu-fab:hover {
      transform: scale(1.1);
      background: #000;
    }
    #jaadu-fab:active {
      transform: scale(0.95);
    }
    #jaadu-overlay {
      position: fixed;
      bottom: 100px;
      right: 30px;
      width: 450px;
      height: 650px;
      background: rgba(255, 255, 255, 0.65);
      backdrop-filter: blur(20px) saturate(180%);
      border-radius: 28px;
      box-shadow: 0 15px 45px rgba(0,0,0,0.15);
      z-index: 2147483647;
      border: 1px solid rgba(255,255,255,0.25);
      overflow: hidden;
      display: none;
      transform-origin: bottom right;
    }
    #jaadu-overlay.visible {
      display: block;
      animation: jaadu-pop 0.25s ease;
    }
    @keyframes jaadu-pop {
      from { opacity: 0; transform: scale(0.85) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `;
  shadow.appendChild(style);

  // FAB
  const fab = document.createElement('div');
  fab.id = 'jaadu-fab';
  fab.textContent = 'J';
  fab.onclick = (e) => {
    e.stopPropagation();
    toggleOverlay();
  };
  shadow.appendChild(fab);

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'jaadu-overlay';

  const iframe = document.createElement('iframe');
  try {
    iframe.src = chrome.runtime.getURL('index.html');
  } catch {
    console.log("Jaadu: Context invalid during iframe load.");
    return;
  }

  overlay.appendChild(iframe);
  shadow.appendChild(overlay);
  document.body.appendChild(container);

  console.log("Jaadu UI Injected");
};

const toggleOverlay = () => {
  if (!isContextValid()) {
    console.log("Jaadu: Context invalidated. Refresh the page.");
    return;
  }

  const root = document.getElementById('jaadu-root');
  if (!root || !root.shadowRoot) {
    injectJaadu();
    return;
  }

  const overlay = root.shadowRoot.getElementById('jaadu-overlay');
  if (!overlay) return;

  isVisible = !isVisible;
  overlay.classList.toggle('visible', isVisible);
};

// Safe message listener
if (isContextValid()) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isContextValid()) return;

    console.log("Jaadu: Received message", message);

    if (message.type === "TOGGLE_OVERLAY") {
      toggleOverlay();
    } else if (message.type === "EXTRACT_PAGE_INFO") {
      const pageText = document.body?.innerText || "";
      const cleanText = pageText.replace(/\s+/g, ' ').trim();

      sendResponse({
        summary: cleanText.substring(0, 500) + "...",
        fullContent: cleanText
      });
    }
    return true;
  });
}

// Initialize
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectJaadu();
} else {
  window.addEventListener('DOMContentLoaded', injectJaadu);
}
