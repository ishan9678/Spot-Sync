// Background script manages offscreen document and message routing
let offscreenCreated = false;

// Create offscreen document if it doesn't exist
async function createOffscreenDocument() {
  if (offscreenCreated) {
    return;
  }

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      offscreenCreated = true;
      console.log('[Background] Offscreen document already exists');
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
      justification: 'PeerJS requires DOM APIs for WebRTC connections'
    });
    offscreenCreated = true;
    console.log('[Background] Offscreen document created');
  } catch (error) {
    console.error('[Background] Failed to create offscreen document:', error);
    throw error;
  }
}

// Ensure offscreen document exists before sending messages
async function sendToOffscreen(message: any): Promise<any> {
  try {
    await createOffscreenDocument();
    return chrome.runtime.sendMessage(message);
  } catch (error) {
    console.error('[Background] Error with offscreen document:', error);
    throw error;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Background] Received message:', msg, 'from:', sender);

  // If message is from popup, forward to offscreen document
  if (!sender.tab && !sender.url?.includes('offscreen')) {
    console.log('[Background] Forwarding to offscreen:', msg);
    sendToOffscreen(msg)
      .then(response => {
        console.log('[Background] Response from offscreen:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] Error communicating with offscreen:', error);
        sendResponse({ error: error.message });
      });
    return true; // keep sendResponse async
  }
  
  // If message is from offscreen document, it's already handled by the runtime
  // Just let it propagate to popup if it's listening
  return false;
});

// Clean up offscreen document when extension is disabled/updated
chrome.runtime.onSuspend.addListener(() => {
  if (offscreenCreated) {
    chrome.offscreen.closeDocument();
    offscreenCreated = false;
  }
});
