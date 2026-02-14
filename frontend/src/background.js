// Toggle the Jaadu overlay when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
    } catch (err) {
        console.log("Overlay not available on this page (likely a restricted browser page)");
    }
});

// Create context menus
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "explain-selection",
        title: "Explain with Jaadu",
        contexts: ["selection"],
    });

    chrome.contextMenus.create({
        id: "save-note",
        title: "Save Note to Jaadu",
        contexts: ["selection"],
    });

    chrome.contextMenus.create({
        id: "save-page",
        title: "Save Page to Jaadu",
        contexts: ["page"],
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "explain-selection") {
        // Communicate with the sidepanel to explain the selection
        chrome.runtime.sendMessage({
            type: "EXPLAIN_SELECTION",
            text: info.selectionText,
        });
    } else if (info.menuItemId === "save-note") {
        // Save note to storage
        const note = {
            id: Date.now(),
            type: "note",
            content: info.selectionText,
            url: tab.url,
            timestamp: new Date().toISOString(),
        };
        saveToJaadu(note);
    } else if (info.menuItemId === "save-page") {
        // Request content script to extract page info
        chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_INFO" }, (response) => {
            if (response) {
                const page = {
                    id: Date.now(),
                    type: "page",
                    title: tab.title,
                    url: tab.url,
                    summary: response.summary,
                    timestamp: new Date().toISOString(),
                };
                saveToJaadu(page);
            }
        });
    }
});

// Media Control Logic
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_MEDIA_STATE") {
        detectMedia().then(sendResponse);
        return true;
    } else if (message.type === "TOGGLE_MEDIA") {
        toggleMedia(message.tabId).then(sendResponse);
        return true;
    }
});

async function detectMedia() {
    const tabs = await chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://*.spotify.com/*"] });
    if (tabs.length === 0) return null;

    // Find the first tab that is actually playing (if possible)
    // For now, just return the first one found
    const mediaTab = tabs[0];
    return {
        tabId: mediaTab.id,
        title: mediaTab.title,
        url: mediaTab.url,
        isPlaying: mediaTab.audible
    };
}

async function toggleMedia(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const video = document.querySelector('video');
                if (video) {
                    if (video.paused) video.play();
                    else video.pause();
                }
            }
        });
        return { success: true };
    } catch (e) {
        console.error("Media toggle failed:", e);
        return { success: false };
    }
}

async function saveToJaadu(data) {
    const result = await chrome.storage.local.get(["jaadu_data"]);
    const jaaduData = result.jaadu_data || [];
    jaaduData.push(data);
    await chrome.storage.local.set({ jaadu_data: jaaduData });
    console.log("Saved to Jaadu:", data);

    // Notify sidepanel to refresh
    chrome.runtime.sendMessage({ type: "DATA_UPDATED" });
}
