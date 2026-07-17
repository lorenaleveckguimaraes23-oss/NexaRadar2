// ========================================
// NEXA RADAR
// Background Service Worker
// Manifest V3
// ========================================

chrome.runtime.onInstalled.addListener(() => {

    console.log("Nexa Radar iniciado com sucesso.");

});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "PING") {

        sendResponse({
            status: "online",
            message: "Nexa Radar funcionando."
        });

    }

    return true;

});