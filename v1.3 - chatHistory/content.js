// Global variables
let currentPlatform = null;
let chatObserver = null;
let messageElements = [];
let lastProcessedMessage = null;

// Initialize when content script is loaded
init();

function init() {
    // Determine which platform we're on
    if (window.location.hostname.includes('instagram.com')) {
        currentPlatform = 'instagram';
    } else if (window.location.hostname.includes('facebook.com')) {
        currentPlatform = 'facebook';
    } else {
        console.log('ChatMate: Not on a supported platform');
        return;
    }

    console.log(`ChatMate: Initialized on ${currentPlatform}`);

    // Listen for messages from popup or background script
    chrome.runtime.onMessage.addListener(handleMessages);

    // Create status badge after a short delay
    setTimeout(createStatusBadge, 2000);
}

// Function to send a message in the chat
function sendMessageToChat(text) {
    try {
        // Find the input field
        let inputField = null;

        if (currentPlatform === 'instagram') {
            // Instagram message input - updated selectors for latest UI
            const inputSelectors = [
                'div[role="textbox"][contenteditable="true"]',
                '.x1i0vuye.xvbhtw8.x1ejq31n',
                'div[aria-label="Message"]',
                'div[data-lexical-editor="true"]'
            ];

            for (const selector of inputSelectors) {
                inputField = document.querySelector(selector);
                if (inputField) break;
            }
        } else if (currentPlatform === 'facebook') {
            // Facebook message input
            inputField = document.querySelector('div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]') ||
                document.querySelector('.x1i0vuye.xvbhtw8.x1ejq31n');
        }

        if (!inputField) {
            console.error('ChatMate: Message input field not found');
            return false;
        }

        // Focus on the input field
        inputField.focus();

        // Set the message text
        // Using execCommand for compatibility, though it's deprecated
        document.execCommand('insertText', false, text);

        // Alternatively, dispatch events to simulate typing
        inputField.textContent = text;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));

        // Don't automatically send the message, just insert the text
        return true;
    } catch (error) {
        console.error('ChatMate: Error inserting message', error);
        return false;
    }
}

// Function to get the current thread ID
function getCurrentThreadId() {
    try {
        if (currentPlatform === 'instagram') {
            // Try to extract thread ID from URL
            const match = window.location.href.match(/\/direct\/t\/([\w-]+)/);

            // If we can't find the thread ID in the URL, generate a unique ID based on the chat
            if (match && match[1]) {
                return match[1];
            } else {
                // For the newer Instagram UI where thread ID might not be in URL
                const chatContainer = document.querySelector('div[role="dialog"]');
                if (chatContainer) {
                    const headerUsername = document.querySelector('h1.x1lliihq');
                    const dialogHeader = document.querySelector('div[role="dialog"] h1');

                    let username = '';
                    if (headerUsername && headerUsername.textContent) {
                        username = headerUsername.textContent.trim();
                    } else if (dialogHeader && dialogHeader.textContent) {
                        username = dialogHeader.textContent.trim();
                    }

                    if (username) {
                        return `instagram_${username.replace(/\s+/g, '_')}`;
                    }
                }
                return 'instagram_unknown';
            }
        } else if (currentPlatform === 'facebook') {
            // Try to extract thread ID from URL
            const match = window.location.href.match(/\/messages\/t\/([\w.]+)/);
            return match ? match[1] : 'facebook_unknown';
        }

        return 'unknown';
    } catch (error) {
        console.error('ChatMate: Error getting thread ID', error);
        return 'error';
    }
}

// Handle messages from popup or background
function handleMessages(request, sender, sendResponse) {
    // Handler for getting current thread ID
    if (request.action === 'getCurrentThreadId') {
        const threadId = getCurrentThreadId();
        console.log(`ChatMate: Returning current thread ID: ${threadId}`);
        sendResponse({ threadId: threadId });
        return true;
    }

    // Handler for sending messages directly from the popup
    if (request.action === 'sendMessage') {
        console.log(`ChatMate: Sending message from popup: "${request.text}"`);

        // Send the message
        const success = sendMessageToChat(request.text);

        // Send response back to popup
        if (success) {
            // Get current thread ID to store the message in history
            const threadId = getCurrentThreadId();

            // Store this message in conversation history
            if (threadId) {
                chrome.runtime.sendMessage({
                    action: 'storeConversation',
                    threadId: threadId,
                    role: 'assistant',
                    content: request.text
                });
            }

            sendResponse({ success: true });
            console.log(`ChatMate: Successfully sent message from popup`);
        } else {
            sendResponse({
                success: false,
                error: 'Failed to send message. Make sure you are on a chat page.'
            });
            console.log(`ChatMate: Failed to send message from popup`);
        }
        return true;
    }

    // Handler for inserting response text into message input
    if (request.action === 'insertResponse') {
        console.log(`ChatMate: Received responses for text: "${request.originalText.substring(0, 50)}..."`);

        if (Array.isArray(request.responses) && request.responses.length > 0) {
            // Show the response options popup
            showResponseOptionsPopup(request.responses, request.originalText);
            sendResponse({ success: true });
        } else {
            showNotification('Error: No valid responses received', 'error');
            sendResponse({ success: false });
        }

        return true;
    }

    // Handler for showing errors
    if (request.action === 'showError') {
        console.log(`ChatMate: Error for text: "${request.originalText.substring(0, 50)}...": ${request.error}`);

        showNotification('Error: ' + request.error, 'error');

        sendResponse({ success: true });
        return true;
    }
}

// Create a popup to show multiple response options
function showResponseOptionsPopup(responses, originalText) {
    // Remove any existing popup
    const existingPopup = document.getElementById('chatmate-response-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'chatmate-response-popup';
    popup.className = 'chatmate-response-popup';

    // Create response option elements
    const responseOptions = responses.map((response, index) => {
        return `
            <div class="response-option">
                <p class="response-text">${response}</p>
                <div class="response-actions">
                    <button class="copy-btn" data-index="${index}">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="insert-btn" data-index="${index}">
                        <i class="fas fa-arrow-circle-right"></i> Insert
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Create popup content
    popup.innerHTML = `
        <div class="popup-header">
            <h3>ChatMate Responses</h3>
            <button class="close-btn">&times;</button>
        </div>
        <div class="popup-content">
            <div class="original-text">
                <h4>Original:</h4>
                <p>${originalText}</p>
            </div>
            <div class="response-options">
                <h4>Choose a response:</h4>
                ${responseOptions}
            </div>
        </div>
    `;

    // Add popup to the page
    document.body.appendChild(popup);

    // Position popup near the center of the screen
    popup.style.top = (window.innerHeight / 2 - popup.offsetHeight / 2) + 'px';
    popup.style.left = (window.innerWidth / 2 - popup.offsetWidth / 2) + 'px';

    // Add event listeners
    popup.querySelector('.close-btn').addEventListener('click', () => {
        popup.remove();
    });

    // Add event listeners for all copy buttons
    popup.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', () => {
            const index = parseInt(button.getAttribute('data-index'));
            navigator.clipboard.writeText(responses[index])
                .then(() => {
                    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        button.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                })
                .catch(err => {
                    console.error('ChatMate: Failed to copy text: ', err);
                });
        });
    });

    // Add event listeners for all insert buttons
    popup.querySelectorAll('.insert-btn').forEach(button => {
        button.addEventListener('click', () => {
            const index = parseInt(button.getAttribute('data-index'));
            const success = sendMessageToChat(responses[index]);

            if (success) {
                popup.remove();
                showNotification('Response inserted in message input');

                // Store the response in conversation history
                const threadId = getCurrentThreadId();
                if (threadId) {
                    chrome.runtime.sendMessage({
                        action: 'storeConversation',
                        threadId: threadId,
                        role: 'assistant',
                        content: responses[index]
                    });
                }
            } else {
                button.innerHTML = '<i class="fas fa-times"></i> Failed!';
                setTimeout(() => {
                    button.innerHTML = '<i class="fas fa-arrow-circle-right"></i> Insert';
                }, 2000);

                // Try clipboard as fallback
                navigator.clipboard.writeText(responses[index])
                    .then(() => {
                        showNotification('Response copied to clipboard as fallback');
                    })
                    .catch(err => {
                        console.error('ChatMate: Failed to copy text: ', err);
                    });
            }
        });
    });

    // Add event listener to close popup when clicking outside
    document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target) && e.target !== popup) {
            popup.remove();
            document.removeEventListener('click', closePopup);
        }
    });
}

// Show a temporary notification
function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existingNotification = document.getElementById('chatmate-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'chatmate-notification';
    notification.className = `chatmate-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span>${message}</span>
        </div>
    `;

    // Add to document
    document.body.appendChild(notification);

    // Remove after a delay
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Add a floating badge to indicate ChatMate status
function createStatusBadge() {
    const existingBadge = document.getElementById('chatmate-badge');
    if (existingBadge) {
        return existingBadge;
    }

    const badge = document.createElement('div');
    badge.id = 'chatmate-badge';
    badge.className = 'chatmate-badge';
    badge.textContent = 'ChatMate Active';

    document.body.appendChild(badge);
    return badge;
}

// Add some updated styles for multiple response options
const styleElement = document.createElement('style');
styleElement.textContent = `
  .chatmate-badge {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: rgba(66, 133, 244, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 20px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  
  .chatmate-badge:hover {
    transform: scale(1.05);
  }
  
  .chatmate-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: rgba(52, 168, 83, 0.95);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    transition: opacity 0.5s ease;
    max-width: 300px;
  }
  
  .chatmate-notification.error {
    background-color: rgba(234, 67, 53, 0.95);
  }
  
  .chatmate-notification.fade-out {
    opacity: 0;
  }
  
  .chatmate-response-popup {
    position: absolute;
    width: 400px;
    max-width: 90vw;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    z-index: 10000;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
    animation: popup-fade-in 0.3s ease;
  }
  
  @keyframes popup-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .chatmate-response-popup .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background-color: #4285f4;
    color: white;
  }
  
  .chatmate-response-popup .popup-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }
  
  .chatmate-response-popup .close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    margin: 0;
    line-height: 1;
  }
  
  .chatmate-response-popup .popup-content {
    padding: 15px;
    max-height: 80vh;
    overflow-y: auto;
  }
  
  .chatmate-response-popup .original-text,
  .chatmate-response-popup .response-options {
    margin-bottom: 15px;
  }
  
  .chatmate-response-popup h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #555;
  }
  
  .chatmate-response-popup .original-text p {
    margin: 0;
    padding: 8px 12px;
    background-color: #f5f5f5;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.4;
  }
  
  .chatmate-response-popup .response-option {
    margin-bottom: 15px;
    padding: 10px;
    background-color: #e3f2fd;
    border-left: 3px solid #4285f4;
    border-radius: 4px;
    transition: transform 0.2s ease;
  }
  
  .chatmate-response-popup .response-option:hover {
    transform: translateX(5px);
  }
  
  .chatmate-response-popup .response-text {
    margin: 0 0 10px 0;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .chatmate-response-popup .response-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  
  .chatmate-response-popup button {
    background-color: #4285f4;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  .chatmate-response-popup button:hover {
    background-color: #3367d6;
  }
  
  .chatmate-response-popup .copy-btn {
    background-color: #616161;
  }
  
  .chatmate-response-popup .copy-btn:hover {
    background-color: #4e4e4e;
  }
  
  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .chatmate-response-popup {
      background-color: #333;
      color: #eee;
    }
    
    .chatmate-response-popup h4 {
      color: #ccc;
    }
    
    .chatmate-response-popup .original-text p {
      background-color: #444;
      color: #eee;
    }
    
    .chatmate-response-popup .response-option {
      background-color: #2a3f5a;
      border-left: 3px solid #4285f4;
    }
  }
`;
document.head.appendChild(styleElement);

// Debug function to help identify what's wrong
function runDebugTests() {
    console.log("=== CHATMATE DEBUG TESTS ===");

    // 1. Test input field selectors
    const inputSelectors = [
        'div[role="textbox"][contenteditable="true"]',
        '.x1i0vuye.xvbhtw8.x1ejq31n',
        'div[aria-label="Message"]',
        'div[data-lexical-editor="true"]',
        // Add more potential selectors
        'div[contenteditable="true"]',
        'div.notranslate._5rpu',
        'div.focus-visible'
    ];

    console.log("\nTesting input field selectors:");
    inputSelectors.forEach(selector => {
        const element = document.querySelector(selector);
        console.log(`- Input selector "${selector}": ${element ? "FOUND" : "NOT FOUND"}`);
        if (element) {
            console.log(`  Attributes: ${element.outerHTML.substring(0, 100)}...`);
        }
    });

    // 2. Test thread ID detection
    console.log("\nTesting thread ID detection:");
    try {
        const threadId = getCurrentThreadId();
        console.log(`- Thread ID: ${threadId}`);

        // Test URL matching
        const urlMatch = window.location.href.match(/\/direct\/t\/([\w-]+)/);
        console.log(`- URL match: ${urlMatch ? urlMatch[1] : "No match"}`);

        // Test header detection
        const headerUsername = document.querySelector('h1.x1lliihq');
        const dialogHeader = document.querySelector('div[role="dialog"] h1');
        console.log(`- Header username element: ${headerUsername ? "Found" : "Not found"}`);
        console.log(`- Dialog header element: ${dialogHeader ? "Found" : "Not found"}`);

        if (headerUsername) {
            console.log(`  Header text: "${headerUsername.textContent}"`);
        }
        if (dialogHeader) {
            console.log(`  Dialog header text: "${dialogHeader.textContent}"`);
        }
    } catch (error) {
        console.error("Error in thread ID detection:", error);
    }
}

// Call the debug function after a delay to let Instagram fully load
setTimeout(runDebugTests, 5000);