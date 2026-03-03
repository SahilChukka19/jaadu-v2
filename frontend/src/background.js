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



async function saveToJaadu(data) {
    const result = await chrome.storage.local.get(["jaadu_data"]);
    const jaaduData = result.jaadu_data || [];
    jaaduData.push(data);
    await chrome.storage.local.set({ jaadu_data: jaaduData });
    console.log("Saved to Jaadu:", data);

    // Notify sidepanel to refresh
    chrome.runtime.sendMessage({ type: "DATA_UPDATED" });
}
