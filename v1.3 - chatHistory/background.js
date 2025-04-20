// Initialize extension state
let conversationHistory = {};
let apiKey = "";

// Load the API key if it exists
chrome.storage.local.get(['apiKey'], function(result) {
    if (result.apiKey) {
        apiKey = result.apiKey;
    }
});

// Create context menu for generating responses from selected text
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "generateResponseFromSelection",
        title: "Generate response with ChatMate",
        contexts: ["selection"],
        documentUrlPatterns: ["*://*.instagram.com/*", "*://*.facebook.com/*"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "generateResponseFromSelection" && info.selectionText) {
        console.log(`ChatMate Background: Context menu clicked, selected text: "${info.selectionText.substring(0, 50)}..."`);

        // Get saved settings
        chrome.storage.local.get(['conversationMode', 'tone'], function(result) {
            const mode = result.conversationMode || 'casual';
            const tone = result.tone || 'friendly';

            // Get the current thread ID from the content script
            chrome.tabs.sendMessage(tab.id, { action: 'getCurrentThreadId' }, function(response) {
                const threadId = response && response.threadId ? response.threadId : null;

                // Generate response for the selected text with thread context if available
                generateChatResponse(info.selectionText, mode, tone, threadId)
                    .then(responses => {
                        console.log(`ChatMate Background: Generated responses for selection:`, responses);
                        // Send the generated responses to the content script
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'insertResponse',
                            responses: responses,
                            originalText: info.selectionText
                        });

                        // Store this interaction in conversation history if we have a thread ID
                        if (threadId) {
                            // Store the user message
                            storeMessage(threadId, 'user', info.selectionText);
                        }
                    })
                    .catch(error => {
                        console.error('ChatMate Background: Error generating response for selection:', error);
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'showError',
                            error: error.message,
                            originalText: info.selectionText
                        });
                    });
            });
        });
    }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateApiKey') {
        apiKey = request.apiKey;
        console.log('ChatMate Background: API key updated');
        return true;
    }

    if (request.action === 'testApiKey') {
        console.log('ChatMate Background: Testing API key validity');
        testApiKey(request.apiKey)
            .then(isValid => {
                console.log(`ChatMate Background: API key test result: ${isValid ? 'valid' : 'invalid'}`);
                sendResponse({ success: isValid });
            })
            .catch(error => {
                console.error('ChatMate Background: API key test error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for the async response
    }

    if (request.action === 'generateResponse') {
        console.log(`ChatMate Background: Generating response for message: "${request.message}"`);

        // Get thread ID if provided
        const threadId = request.threadId || null;

        generateChatResponse(request.message, request.conversationMode, request.tone, threadId)
            .then(responses => {
                console.log(`ChatMate Background: Generated responses:`, responses);
                sendResponse({ success: true, responses: responses });

                // Store this interaction in conversation history if we have a thread ID
                if (threadId) {
                    // Store the user message
                    storeMessage(threadId, 'user', request.message);
                }
            })
            .catch(error => {
                console.error('ChatMate Background: Error generating response:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for the async response
    }

    if (request.action === 'storeConversation') {
        console.log(`ChatMate Background: Storing conversation message: "${request.content}" from thread: ${request.threadId}`);
        storeMessage(request.threadId, request.role, request.content);
        sendResponse({ success: true });
        return true;
    }

    // New handler for getting conversation history
    if (request.action === 'getConversationHistory') {
        console.log('ChatMate Background: Returning conversation history');
        sendResponse({
            success: true,
            conversations: conversationHistory
        });
        return true;
    }
});

// Function to generate chat response using Gemini API
async function generateChatResponse(message, conversationMode, tone, threadId) {
    try {
        // Get conversation history if threadId is provided
        let conversationContext = [];
        if (threadId && conversationHistory[threadId]) {
            // Get last 5 messages from history to use as context
            conversationContext = conversationHistory[threadId].slice(-5);
            console.log(`ChatMate Background: Using ${conversationContext.length} previous messages as context`);
        }

        // Generate multiple responses with conversation context
        const responses = await fetchMultipleResponses(message, conversationMode, tone, conversationContext);
        if (responses && responses.length > 0) {
            return responses;
        }

        // If Gemini API fails, fall back to our local response generator
        console.log('Falling back to local response generator');
        return generateLocalMultipleResponses(message, conversationMode, tone);
    } catch (error) {
        console.error('Error in generateChatResponse:', error);
        // Fall back to local response generator
        return generateLocalMultipleResponses(message, conversationMode, tone);
    }
}

// Function to call Gemini API for multiple responses
async function fetchMultipleResponses(message, conversationMode, tone, conversationContext = []) {
    try {
        // Check if API key exists
        if (!apiKey) {
            console.log('ChatMate Background: No API key provided for Gemini');
            return null;
        }

        console.log(`ChatMate Background: Starting Gemini API request with key length: ${apiKey.length}`);
        console.log(`ChatMate Background: Key starts with: ${apiKey.substring(0, 4)}...`);

        // Construct a prompt based on the conversation mode and tone, asking for multiple options
        const prompt = constructMultipleResponsePrompt(message, conversationMode, tone, conversationContext);
        console.log(`ChatMate Background: Using prompt: "${prompt.substring(0, 100)}..."`);

        // Prepare request data for logging
        const requestData = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 300, // Increased to accommodate multiple responses
            }
        };

        console.log(`ChatMate Background: Sending request to Gemini API with data:`, JSON.stringify(requestData));

        // Call the Gemini API with the free tier
        // Using gemini-1.5-flash model which is supported in the v1beta API
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        console.log(`ChatMate Background: Using API URL: ${apiUrl.replace(apiKey, "API_KEY_HIDDEN")}`);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestData)
        });

        console.log(`ChatMate Background: API response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ChatMate Background: Gemini API error response:', errorText);
            // Try a different model if there's an issue with this one
            return await tryFallbackModelForMultipleResponses(prompt);
        }

        const result = await response.json();
        console.log('ChatMate Background: API response structure:', JSON.stringify(result, null, 2));

        // Extract the response text from Gemini's response format
        if (result &&
            result.candidates &&
            result.candidates.length > 0 &&
            result.candidates[0].content &&
            result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {

            const responseText = result.candidates[0].content.parts[0].text.trim();
            console.log(`ChatMate Background: Extracted response text: "${responseText}"`);

            // Parse the response text to extract the three options
            const options = parseResponseOptions(responseText);
            return options.map(option => ensureHinglish(option));
        }

        console.error('ChatMate Background: Unexpected Gemini API response format:', result);
        return null;
    } catch (error) {
        console.error('ChatMate Background: Gemini API error:', error);
        return null;
    }
}

// Try a fallback model if the primary one fails, for multiple responses
async function tryFallbackModelForMultipleResponses(prompt) {
    try {
        console.log('ChatMate Background: Trying fallback model gemini-1.0-pro');

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`;
        console.log(`ChatMate Background: Using fallback API URL: ${apiUrl.replace(apiKey, "API_KEY_HIDDEN")}`);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 300, // Increased for multiple responses
                }
            })
        });

        console.log(`ChatMate Background: Fallback API response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ChatMate Background: Fallback Gemini API error response:', errorText);
            return null;
        }

        const result = await response.json();

        // Extract the response text from Gemini's response format
        if (result &&
            result.candidates &&
            result.candidates.length > 0 &&
            result.candidates[0].content &&
            result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {

            const responseText = result.candidates[0].content.parts[0].text.trim();
            console.log(`ChatMate Background: Extracted fallback response text: "${responseText}"`);

            // Parse the response text to extract the three options
            const options = parseResponseOptions(responseText);
            return options.map(option => ensureHinglish(option));
        }

        return null;
    } catch (error) {
        console.error('ChatMate Background: Fallback model error:', error);
        return null;
    }
}

// Ensure the response is in Hinglish
function ensureHinglish(text) {
    // Simple check - if it seems to be English only, add some Hindi words
    // In a real implementation, you would use more sophisticated techniques
    const commonHindiWords = [
        "haan", "nahi", "acha", "thik hai", "kya", "kaise", "kyun", "kab",
        "yaar", "dost", "bhai", "behen", "mummy", "papa", "dada", "dadi"
    ];

    const seemsEnglishOnly = !/[\u0900-\u097F]/.test(text) &&
        !commonHindiWords.some(word => text.toLowerCase().includes(word));

    if (seemsEnglishOnly) {
        // If it seems to be English only, add some Hinglish flair
        const hinglishPrefixes = [
            "Haan, ",
            "Acha, ",
            "Thik hai, ",
            "Yaar, ",
            "Arrey, "
        ];

        const hinglishSuffixes = [
            ", samjhe?",
            ", thik hai?",
            ", hai na?",
            ", yaar!",
            "!"
        ];

        const prefix = hinglishPrefixes[Math.floor(Math.random() * hinglishPrefixes.length)];
        const suffix = hinglishSuffixes[Math.floor(Math.random() * hinglishSuffixes.length)];

        return prefix + text + suffix;
    }

    return text;
}

// Parse the response text to extract three options
function parseResponseOptions(text) {
    try {
        // Try to identify numbered options (1., 2., 3.) or options with "Option 1:", etc.
        const optionRegex = /(?:^|\n)(?:Option\s*)?(\d+)[:.)\] ]+(.*?)(?=(?:\n(?:Option\s*)?(?:\d+)[:.)\] ]+|\n\n|$))/gsi;
        const matches = [...text.matchAll(optionRegex)];

        if (matches && matches.length >= 3) {
            return matches.slice(0, 3).map(match => match[2].trim());
        }

        // If we didn't find 3 options with the regex, try splitting by double newlines
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
        if (paragraphs.length >= 3) {
            return paragraphs.slice(0, 3).map(p => p.trim());
        }

        // If we still don't have 3 options, split the text into three parts
        if (text.length > 30) {
            const parts = [];
            // Generate 3 different versions by modifying the text slightly
            parts.push(text);
            parts.push(`Actually, ${text.toLowerCase()}`);
            parts.push(`Well, ${text.replace(/^\w/, c => c.toLowerCase())}`);
            return parts.slice(0, 3);
        }

        // Fallback to local generation if we can't parse 3 options
        return generateLocalMultipleResponses("", "", "").slice(0, 3);
    } catch (error) {
        console.error('Error parsing response options:', error);
        return [text, `Actually, ${text}`, `Well, ${text}`];
    }
}

// Construct a prompt for multiple response options
function constructMultipleResponsePrompt(message, conversationMode, tone, conversationContext = []) {
    // Create context from previous messages if available
    let contextSection = '';
    if (conversationContext && conversationContext.length > 0) {
        contextSection = `
Previous conversation:
${conversationContext.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')}

`;
    }

    // Base prompt template with instructions for the model
    let promptTemplate = `
    You are a helpful AI assistant that generates chat responses in Hinglish (a mix of Hindi and English).
    
    ${contextSection}The user has just sent this message: "${message}"
    
    Create THREE different ${tone} responses in a ${conversationMode} conversation style to reply to this message.
    
    Important guidelines:
    1. Each response MUST be in Hinglish (mix Hindi and English naturally)
    2. Keep each response brief (under 20 words)
    3. Make them sound natural and conversational
    4. Match the ${tone} tone and ${conversationMode} conversation mode
    5. If there's previous conversation context, make your responses relevant to that context
    6. Provide THREE distinct response options, numbered 1, 2, and 3
    7. Each response should have a slightly different approach or wording
    8. Don't include any explanations, just provide the three responses
    
    Three responses:
    `;

    return promptTemplate;
}

// Generate multiple responses locally when API fails
function generateLocalMultipleResponses(message, conversationMode, tone) {
    // Local response generator based on conversationMode and tone
    const hinglishResponses = {
        casual: {
            friendly: [
                "Haan bilkul, main samajh gaya! Koi problem nahi hai.",
                "Acha hai yaar, mujhe bhi yehi lagta hai.",
                "Thik hai bhai, karte hain kal milke.",
                "Main bhi wahi soch raha tha, great minds think alike!",
                "Haan bhai, ekdum sahi baat hai!",
                "Acha laga sun ke, mujhe bhi yahi lagta hai."
            ],
            sarcastic: [
                "Waah kya baat hai, genius ho tum toh!",
                "Oh really? Mujhe to pata hi nahi tha, thanks for enlightening me!",
                "Haan haan, bilkul sahi keh rahe ho, mujhe kya pata hoga.",
                "Kya discovery ki hai aapne, Nobel prize milna chahiye!"
            ],
            formal: [
                "Ji haan, main aapki baat se sehmat hoon.",
                "Aapka suggestion bahut acha hai, hum zaroor consider karenge.",
                "Dhanyavaad aapke feedback ke liye, hum jald hi implement karenge.",
                "Bilkul sahi kaha aapne, hum is par kaam karenge."
            ],
            jovial: [
                "Arrey mast idea hai yaar, ekdum jhakaas!",
                "Hahaha, kya baat hai, maza aa gaya!",
                "Too good yaar, aise hi chill karte rahenge!",
                "Bindaas plan hai boss, let's do it!"
            ],
            flirty: [
                "Tumse baat karna hamesha acha lagta hai, pata hai?",
                "Kya baat hai, har baar impress kar dete ho!",
                "Tumhare messages ka wait karta rehta hoon main.",
                "Tum jab online aate ho, din ban jata hai mera!"
            ]
        },
        flirting: {
            friendly: [
                "Tumhari baatein sunkar acha lagta hai, aur batao kya chal raha hai?",
                "Coffee pe chale kabhi? Baatein karenge, maza aayega!",
                "Tumse milke hamesha khushi hoti hai, pata hai?",
                "Tumhare smile ka description nahi kar sakta, bahut pyaari hai!"
            ],
            sarcastic: [
                "Oh wow, itne flirty messages, koi gf/bf nahi hai kya?",
                "Smooth! Ye line kitno pe try ki ab tak?",
                "Flirt karne mein champion ho tum, practice bahut hai lagta hai!",
                "Yeh pick-up line Google se uthaya ya khud se socha?"
            ],
            formal: [
                "Aapki company mein time spent karna bahut pleasant rahega.",
                "Agar aap free hon to hum coffee pe mil sakte hain.",
                "Aapse milna hamesha ek pleasure hai.",
                "Aapki baatein bahut interesting hain, aur sunna chahta/chahti hoon."
            ],
            jovial: [
                "Oye hoye! Kya baat hai, dil garden garden ho gaya!",
                "Matlab ek number ki baat kar di tune, dil khush ho gaya!",
                "Chal dinner pe chalte hain, meri treat! Maza aayega!",
                "Tumse baat karke mood ekdum top ho jata hai!"
            ],
            flirty: [
                "Tumhari aankhein, main kya kahun... bas kho jata hoon unme.",
                "Tumse baat karna, jaise chocolate khane jaisa addictive hai.",
                "Tumhari smile dekh ke mera din ban jata hai.",
                "Kya karu, tumhe dekh ke control nahi hota compliment kiye bina!"
            ]
        },
        funny: {
            friendly: [
                "Hahaha, tu bhi na! Ekdum comedy king/queen hai!",
                "Arrey waah, hans hans ke pet dukh gaya mera!",
                "LOL yaar tu na standup shuru kar de, talent hai tujhme!",
                "Teri baaton pe hasi control nahi hoti, kya karun!"
            ],
            sarcastic: [
                "Waah, itna funny joke! Has has ke mar gaya main, literally!",
                "Stand-up comedy ka career consider karo, Netflix special pakka hai!",
                "Itna funny tha ki hansna bhool gaya main, sorry!",
                "Nobel prize milna chahiye comedy mein, kya talent hai yaar!"
            ],
            formal: [
                "Aapke humor sense ko salaam hai, bahut entertaining hain aap.",
                "Haste haste aansu aa gaye, bahut badhiya joke tha.",
                "Aapki baaton mein humor ka touch bahut acha lagta hai.",
                "Aap jab bhi kuch funny kehte hain, din ban jata hai."
            ],
            jovial: [
                "Arre baap re! Pet dard ho gaya hasne se!",
                "Kya mazedaar baat kahi tune, mast hai ekdum!",
                "Tu na yaar, comedian hai pakka! Too good!",
                "Hahaha! Ek number ki baat kahi, bindaas!"
            ],
            flirty: [
                "Itna hasate ho, dil chura loge kya?",
                "Tumhara sense of humor bahut sexy hai, pata hai?",
                "Tum jab hasta/hasti ho to aur bhi cute lagte/lagti ho!",
                "Tumhare jokes sunne ke liye main kuch bhi kar sakta/sakti hoon!"
            ]
        },
        professional: {
            friendly: [
                "Bilkul agree karta hoon, aapka approach practical hai.",
                "Haan, project ko lekar excited hoon main bhi!",
                "Team ke saath milkar kaam karna acha lagega.",
                "Aapki strategy effective hai, implement karte hain."
            ],
            sarcastic: [
                "Wow, itna brilliant idea! Kaise socha aapne?",
                "Haan haan, deadline toh sirf suggestion hai, right?",
                "Oh, aur kitne meetings rakhenge? Kam lag rahi hain abhi!",
                "Performance review mein toh promotion pakka hai aise ideas ke saath!"
            ],
            formal: [
                "Aapka suggestion noted hai, hum implement karenge.",
                "Is matter par hum jald hi action lenge.",
                "Aapke input ke liye dhanyavaad, bahut valuable hai.",
                "Hum aapse jald hi sampark karenge is vishay par."
            ],
            jovial: [
                "Ekdum mast plan hai boss, team rock karegi!",
                "Project ki setting lag gayi, ab bas execute karna hai!",
                "Team ko motivate karne ka idea first class hai!",
                "Deadline se pehle khatam kar denge, tension not!"
            ],
            flirty: [
                "Aapke saath kaam karna hamesha pleasure hai.",
                "Coffee break pe discuss karte hain, akele mein?",
                "Aapki presentations dekhkar fan ho gaya/gayi hoon.",
                "Aap jab ideas share karte hain, bahut impressive lagte hain."
            ]
        }
    };

    // Select three different responses from the appropriate category
    const responses = hinglishResponses[conversationMode] && hinglishResponses[conversationMode][tone] ? 
                     hinglishResponses[conversationMode][tone] : 
                     hinglishResponses.casual.friendly;

    // Shuffle array to get random selections
    const shuffled = [...responses].sort(() => 0.5 - Math.random());

    // Select first three (or fewer if we don't have enough)
    let selected = shuffled.slice(0, 3);

    // If we have fewer than 3, duplicate some responses with slight modifications
    while (selected.length < 3) {
        const prefix = ["Actually, ", "Well, ", "Hmm, "][selected.length % 3];
        selected.push(prefix + selected[0]);
    }

    // Add some context from the original message to make them more relevant
    const words = message.split(' ');
    let contextWord = '';

    // Try to find a significant word to use for context
    if (words.length > 3) {
        // Avoid common words by picking from the middle of the message
        const midIndex = Math.floor(words.length / 2);
        contextWord = words[midIndex].replace(/[.,?!]/g, '');

        // Only use if the word is long enough to be meaningful
        if (contextWord.length < 4) {
            contextWord = '';
        }
    }

    // Return the responses, potentially with added context
    if (contextWord) {
        // Add the context word to make it seem more relevant
        return selected.map((resp, i) => {
            if (i === 0) return `${contextWord}? ${resp}`;
            if (i === 1) return `${resp} ${contextWord} ke baare mein soch raha tha.`;
            return `Haan, ${contextWord} important hai. ${resp}`;
        });
    } else {
        return selected;
    }
}

// Function to test if an API key is valid
async function testApiKey(key) {
    try {
        console.log(`ChatMate Background: Testing API key starting with ${key.substring(0, 4)}...`);

        // Simple test prompt
        const testPrompt = "Respond with 'yes' if you can understand this message.";

        // Test API URL
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: testPrompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 20,
                }
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('ChatMate Background: API test response:', result);

            // Check if the response contains valid content
            return !!(result &&
                result.candidates &&
                result.candidates.length > 0 &&
                result.candidates[0].content);
        } else {
            const errorText = await response.text();
            console.error('ChatMate Background: API test error response:', errorText);
            return false;
        }
    } catch (error) {
        console.error('ChatMate Background: API test error:', error);
        return false;
    }
}

// Helper function to store a message in conversation history
function storeMessage(threadId, role, content) {
    if (!threadId) return;
    
    if (!conversationHistory[threadId]) {
        conversationHistory[threadId] = [];
    }

    conversationHistory[threadId].push({
        role: role,
        content: content,
        timestamp: Date.now()
    });

    // Keep only the last 10 messages per thread to save memory
    if (conversationHistory[threadId].length > 10) {
        conversationHistory[threadId].shift();
    }
    
    console.log(`ChatMate Background: Stored ${role} message in thread ${threadId}`);
}