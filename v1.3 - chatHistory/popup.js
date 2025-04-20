document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const conversationMode = document.getElementById('conversation-mode');
    const tone = document.getElementById('tone');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKeySaveBtn = document.getElementById('api-key-save');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const messageInput = document.getElementById('message-input');
    const generateBtn = document.getElementById('generate-btn');
    const responseContainer = document.getElementById('response-container');
    const responseText = document.getElementById('response-text');
    const copyBtn = document.getElementById('copy-btn');
    const sendBtn = document.getElementById('send-btn');
    const addTemplateBtn = document.getElementById('add-template-btn');
    const templateForm = document.getElementById('template-form');
    const templateName = document.getElementById('template-name');
    const templateContent = document.getElementById('template-content');
    const saveTemplateBtn = document.getElementById('save-template-btn');
    const cancelTemplateBtn = document.getElementById('cancel-template-btn');
    const templatesList = document.getElementById('templates-list');
    const historySearch = document.getElementById('history-search');
    const historySearchBtn = document.getElementById('history-search-btn');
    const conversationList = document.getElementById('conversation-list');
    const conversationDetail = document.getElementById('conversation-detail');
    const backToListBtn = document.getElementById('back-to-list-btn');
    const conversationTitle = document.getElementById('conversation-title');
    const conversationMessages = document.getElementById('conversation-messages');

    // State
    let templates = [];
    let editingTemplateId = null;
    let conversations = {};
    let darkMode = false;

    // Load saved settings
    chrome.storage.local.get([
        'conversationMode',
        'tone',
        'apiKey',
        'darkMode',
        'templates'
    ], function(result) {
        // Set conversation mode
        if (result.conversationMode) {
            conversationMode.value = result.conversationMode;
        }

        // Set tone
        if (result.tone) {
            tone.value = result.tone;
        }

        // Set API key if exists
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }

        // Set dark mode
        if (result.darkMode) {
            darkMode = result.darkMode;
            darkModeToggle.checked = darkMode;
            if (darkMode) {
                document.body.classList.add('dark-mode');
            }
        }

        // Load templates
        if (result.templates && Array.isArray(result.templates)) {
            templates = result.templates;
            renderTemplates();
        }
    });

    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');

            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // Load content based on tab
            if (tabId === 'history') {
                loadConversationHistory();
            }
        });
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('change', function() {
        darkMode = this.checked;
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // Save preference
        chrome.storage.local.set({ 'darkMode': darkMode });
    });

    // Save conversation mode when changed
    conversationMode.addEventListener('change', function() {
        chrome.storage.local.set({ 'conversationMode': this.value });
        console.log('Conversation mode saved: ' + this.value);
    });

    // Save tone when changed
    tone.addEventListener('change', function() {
        chrome.storage.local.set({ 'tone': this.value });
        console.log('Tone saved: ' + this.value);
    });

    // Save API key when the save button is clicked
    apiKeySaveBtn.addEventListener('click', function() {
        const key = apiKeyInput.value.trim();

        // Validate API key format (basic check)
        if (!key) {
            showStatusMessage('Please enter a valid API key', 'error');
            return;
        }

        // Basic validation for Gemini API key format
        if (!key.startsWith('AI') || key.length < 20) {
            showStatusMessage('Invalid API key format. Gemini keys typically start with "AI" and are longer.', 'error');
            return;
        }

        // Save the API key
        chrome.storage.local.set({ 'apiKey': key }, function() {
            showStatusMessage('API key saved successfully!', 'success');

            // Try to validate the key by making a test request
            chrome.runtime.sendMessage({
                action: 'testApiKey',
                apiKey: key
            }, function(response) {
                if (response && response.success) {
                    showStatusMessage('API key verified and working!', 'success');
                } else {
                    showStatusMessage('API key saved, but verification failed. It may not work correctly.', 'warning');
                }
            });

            // Also update the background script
            chrome.runtime.sendMessage({
                action: 'updateApiKey',
                apiKey: key
            });
        });
    });

    // Generate response button
    generateBtn.addEventListener('click', function() {
        const message = messageInput.value.trim();
        if (!message) {
            showStatusMessage('Please enter a message to generate a response', 'error');
            return;
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        chrome.storage.local.get(['conversationMode', 'tone', 'apiKey'], function(result) {
            if (!result.apiKey) {
                showStatusMessage('Please set your API key first', 'error');
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-bolt"></i> Generate Response';
                return;
            }

            // Get the current active tab to check if we're on a chat page
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                // First get the thread ID from the content script if we're on a supported page
                chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentThreadId' }, function(threadResponse) {
                    // threadId will be undefined if we're not on a supported page or there was an error
                    const threadId = threadResponse && threadResponse.threadId &&
                        threadResponse.threadId !== 'unknown' &&
                        threadResponse.threadId !== 'error' ?
                        threadResponse.threadId : null;

                    console.log(`Popup: Using thread ID for response generation: ${threadId || 'none'}`);

                    // Generate the response with thread context if available
                    chrome.runtime.sendMessage({
                        action: 'generateResponse',
                        message: message,
                        conversationMode: result.conversationMode || 'casual',
                        tone: result.tone || 'friendly',
                        threadId: threadId
                    }, function(response) {
                        generateBtn.disabled = false;
                        generateBtn.innerHTML = '<i class="fas fa-bolt"></i> Generate Response';

                        if (response && response.success && response.responses && response.responses.length > 0) {
                            // Clear previous response container content
                            responseContainer.innerHTML = '';

                            // Create new heading
                            const heading = document.createElement('h4');
                            heading.textContent = 'Choose a response:';
                            responseContainer.appendChild(heading);

                            // Create container for response options
                            const optionsContainer = document.createElement('div');
                            optionsContainer.className = 'response-options';

                            // Create each response option
                            response.responses.forEach((text, index) => {
                                const option = document.createElement('div');
                                option.className = 'response-option';

                                const content = document.createElement('p');
                                content.className = 'response-text';
                                content.textContent = text;

                                const actions = document.createElement('div');
                                actions.className = 'response-actions';

                                const copyBtn = document.createElement('button');
                                copyBtn.className = 'copy-option-btn';
                                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                                copyBtn.setAttribute('data-index', index);

                                const useBtn = document.createElement('button');
                                useBtn.className = 'use-option-btn primary';
                                useBtn.innerHTML = '<i class="fas fa-check"></i> Use';
                                useBtn.setAttribute('data-index', index);

                                actions.appendChild(copyBtn);
                                actions.appendChild(useBtn);

                                option.appendChild(content);
                                option.appendChild(actions);

                                optionsContainer.appendChild(option);
                            });

                            responseContainer.appendChild(optionsContainer);
                            responseContainer.classList.remove('hidden');

                            // Add event listeners for buttons
                            const copyButtons = document.querySelectorAll('.copy-option-btn');
                            copyButtons.forEach(btn => {
                                btn.addEventListener('click', function() {
                                    const index = parseInt(this.getAttribute('data-index'));
                                    navigator.clipboard.writeText(response.responses[index]).then(function() {
                                        showStatusMessage('Response copied to clipboard!', 'success');
                                    }, function() {
                                        showStatusMessage('Failed to copy response', 'error');
                                    });
                                });
                            });

                            const useButtons = document.querySelectorAll('.use-option-btn');
                            useButtons.forEach(btn => {
                                btn.addEventListener('click', function() {
                                    const index = parseInt(this.getAttribute('data-index'));

                                    // Store the selected response text for sending
                                    responseText.innerText = response.responses[index];

                                    // Send response to active chat
                                    chrome.tabs.sendMessage(tabs[0].id, {
                                        action: 'sendMessage',
                                        text: response.responses[index]
                                    }, function(response) {
                                        if (response && response.success) {
                                            showStatusMessage('Message sent to chat!', 'success');
                                        } else {
                                            showStatusMessage('Failed to send message to chat. Make sure you are on an Instagram or Facebook chat page.', 'error');
                                        }
                                    });
                                });
                            });
                        } else {
                            showStatusMessage('Failed to generate response: ' + (response && response.error ? response.error : 'Unknown error'), 'error');
                        }
                    });
                });
            });
        });
    });

    // Copy response to clipboard
    copyBtn.addEventListener('click', function() {
        const text = responseText.innerText;
        navigator.clipboard.writeText(text).then(function() {
            showStatusMessage('Response copied to clipboard!', 'success');
        }, function() {
            showStatusMessage('Failed to copy response', 'error');
        });
    });

    // Send response to active chat
    sendBtn.addEventListener('click', function() {
        const text = responseText.innerText;

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'sendMessage',
                text: text
            }, function(response) {
                if (response && response.success) {
                    showStatusMessage('Message sent to chat!', 'success');
                } else {
                    showStatusMessage('Failed to send message to chat. Make sure you are on an Instagram or Facebook chat page.', 'error');
                }
            });
        });
    });

    // Templates management
    addTemplateBtn.addEventListener('click', function() {
        editingTemplateId = null;
        templateName.value = '';
        templateContent.value = '';
        templateForm.classList.remove('hidden');
    });

    saveTemplateBtn.addEventListener('click', function() {
        const name = templateName.value.trim();
        const content = templateContent.value.trim();

        if (!name || !content) {
            showStatusMessage('Please enter both a name and content for the template', 'error');
            return;
        }

        if (editingTemplateId !== null) {
            // Update existing template
            const index = templates.findIndex(t => t.id === editingTemplateId);
            if (index !== -1) {
                templates[index] = {
                    id: editingTemplateId,
                    name: name,
                    content: content,
                    createdAt: templates[index].createdAt,
                    updatedAt: new Date().toISOString()
                };
            }
        } else {
            // Add new template
            templates.push({
                id: Date.now(),
                name: name,
                content: content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        // Save templates to storage
        chrome.storage.local.set({ 'templates': templates }, function() {
            templateForm.classList.add('hidden');
            renderTemplates();
            showStatusMessage('Template saved successfully!', 'success');
        });
    });

    cancelTemplateBtn.addEventListener('click', function() {
        templateForm.classList.add('hidden');
    });

    // Render templates list
    function renderTemplates() {
        templatesList.innerHTML = '';

        if (templates.length === 0) {
            templatesList.innerHTML = '<p class="hint" style="text-align: center; margin: 20px 0;">No templates yet. Create one by clicking "Add New".</p>';
            return;
        }

        templates.forEach(template => {
            const templateEl = document.createElement('div');
            templateEl.className = 'template-item fade-in';
            templateEl.innerHTML = `
                <h4 class="template-name">${escapeHtml(template.name)}</h4>
                <p class="template-content">${escapeHtml(template.content)}</p>
                <div class="template-actions">
                    <button class="use-template secondary">
                        <i class="fas fa-paper-plane"></i> Use
                    </button>
                    <button class="edit-template">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="delete-template danger">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Use template button
            templateEl.querySelector('.use-template').addEventListener('click', function() {
                messageInput.value = template.content;

                // Switch to settings tab
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));

                tabButtons[0].classList.add('active');
                document.getElementById('settings-tab').classList.add('active');

                // Focus on generate button
                generateBtn.focus();
            });

            // Edit template button
            templateEl.querySelector('.edit-template').addEventListener('click', function() {
                editingTemplateId = template.id;
                templateName.value = template.name;
                templateContent.value = template.content;
                templateForm.classList.remove('hidden');
            });

            // Delete template button
            templateEl.querySelector('.delete-template').addEventListener('click', function() {
                if (confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
                    templates = templates.filter(t => t.id !== template.id);
                    chrome.storage.local.set({ 'templates': templates }, function() {
                        renderTemplates();
                        showStatusMessage('Template deleted', 'info');
                    });
                }
            });

            templatesList.appendChild(templateEl);
        });
    }

    // Conversation history
    function loadConversationHistory() {
        // Get conversation history from background script
        chrome.runtime.sendMessage({ action: 'getConversationHistory' }, function(response) {
            conversations = response.conversations || {};
            renderConversationList();
        });
    }

    historySearchBtn.addEventListener('click', function() {
        renderConversationList(historySearch.value.trim().toLowerCase());
    });

    historySearch.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            renderConversationList(this.value.trim().toLowerCase());
        }
    });

    backToListBtn.addEventListener('click', function() {
        conversationDetail.classList.add('hidden');
    });

    function renderConversationList(searchTerm = '') {
        conversationList.innerHTML = '';

        const threadIds = Object.keys(conversations);

        if (threadIds.length === 0) {
            conversationList.innerHTML = '<p class="hint" style="text-align: center; margin: 20px 0;">No conversation history yet. Start chatting in Instagram or Facebook to see your history here.</p>';
            return;
        }

        // Sort threads by latest message
        threadIds.sort((a, b) => {
            const aLatest = conversations[a][conversations[a].length - 1].timestamp;
            const bLatest = conversations[b][conversations[b].length - 1].timestamp;
            return bLatest - aLatest;
        });

        threadIds.forEach(threadId => {
            const thread = conversations[threadId];
            const latestMessage = thread[thread.length - 1];

            // Skip if doesn't match search
            if (searchTerm) {
                const messageText = thread.map(m => m.content.toLowerCase()).join(' ');
                if (!messageText.includes(searchTerm)) {
                    return;
                }
            }

            const item = document.createElement('div');
            item.className = 'conversation-item fade-in';

            // Create initials for avatar
            let contactName = "User";
            const initial = contactName.charAt(0).toUpperCase();

            item.innerHTML = `
                <div class="conversation-avatar">${initial}</div>
                <div class="conversation-info">
                    <h4 class="conversation-title">Thread ${threadId.substr(0, 8)}...</h4>
                    <p class="conversation-preview">${escapeHtml(latestMessage.content.substring(0, 50))}${latestMessage.content.length > 50 ? '...' : ''}</p>
                </div>
                <div class="conversation-time">${formatTimestamp(latestMessage.timestamp)}</div>
            `;

            item.addEventListener('click', function() {
                renderConversationDetail(threadId, thread);
            });

            conversationList.appendChild(item);
        });
    }

    function renderConversationDetail(threadId, messages) {
        conversationTitle.textContent = `Thread ${threadId.substr(0, 8)}...`;
        conversationMessages.innerHTML = '';

        messages.forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${message.role === 'user' ? '' : 'user'} fade-in`;

            messageEl.innerHTML = `
                <div class="content">${escapeHtml(message.content)}</div>
                <div class="time">${formatTimestamp(message.timestamp)}</div>
            `;

            conversationMessages.appendChild(messageEl);
        });

        // Scroll to the bottom
        conversationMessages.scrollTop = conversationMessages.scrollHeight;

        // Show detail view
        conversationDetail.classList.remove('hidden');
    }

    // Utility functions
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return formatTime(date);
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
        } else {
            return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
        }
    }

    function formatTime(date) {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12;

        return `${hours}:${minutes < 10 ? '0' + minutes : minutes} ${ampm}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// Helper function to show status messages
function showStatusMessage(message, type = 'info') {
    const statusElement = document.getElementById('status-message');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';

    // Hide the message after 5 seconds
    setTimeout(function() {
        statusElement.style.display = 'none';
    }, 5000);
}

// Add styling for the response options
document.head.insertAdjacentHTML('beforeend', `
<style>
.response-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
}

.response-option {
    padding: 10px;
    background-color: #f5f8ff;
    border-left: 3px solid #4285f4;
    border-radius: 4px;
    transition: transform 0.2s ease;
}

.response-option:hover {
    transform: translateX(5px);
}

.response-text {
    margin: 0 0 10px 0;
    font-size: 14px;
    line-height: 1.5;
}

.response-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.dark-mode .response-option {
    background-color: #2a3f5a;
}
</style>
`);