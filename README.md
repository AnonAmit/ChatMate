# ChatMate Extension

![Chatemate ui](image/https://github.com/AnonAmit/ChatMate/blob/main/chatv1.3.png)
ChatMate is a browser extension that provides personalized, context-aware, and dynamic chat recommendations in Hinglish (a mix of Hindi and English) for social media platforms like Instagram and Facebook.

## Features

- **Multiple Conversation Modes**: Choose from different modes like casual, flirting, funny, and professional.
- **Tone Customization**: Select tones such as friendly, sarcastic, formal, jovial, or flirty.
- **Real-Time Conversation Capture**: The extension captures chat conversations in real-time.
- **Auto-Reply Mode**: Option to automatically respond to incoming messages.
- **Hinglish Support**: All generated messages are in Hinglish, providing a natural conversational experience.
- **AI-Powered**: Uses the Google Gemini API to generate intelligent responses.
- **Free to Use**: Built with Google's free tier Gemini API (generous free quota each month).
- **Offline Fallback**: If the API is unavailable, falls back to local response generation.

## AI Integration

ChatMate uses Google's Gemini API to generate intelligent responses:

- **AI Model**: Gemini 1.5 Flash - Google's versatile and fast multimodal model
- **Free Tier**: Google offers a generous free tier for Gemini API (60 requests per minute)
- **Context-Aware**: The API generates responses based on conversation mode and tone
- **Local Fallback**: If API calls fail, the extension uses pre-defined responses

## Installation

### Local Development Installation

1. Clone this repository:
```
git clone https://github.com/yourusername/chatmate.git
cd chatmate
```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" by toggling the switch in the top right corner
   - Click "Load unpacked" and select the directory containing this code

3. Load the extension in Firefox:
   - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select any file in the extension directory

4. Load the extension in Edge:
   - Open Edge and navigate to `edge://extensions/`
   - Enable "Developer mode" by toggling the switch in the left sidebar
   - Click "Load unpacked" and select the directory containing this code

## API Key Setup (Required)

To use the AI features, you need a Google Gemini API key:

1. Go to [Google AI Studio](https://makersuite.google.com/)
2. Create a free account or sign in with your Google account
3. Navigate to "Get API Key" and create a new key
4. Copy the API key
5. Enter the API key in the ChatMate extension popup and click "Save Key"

## Usage

1. Navigate to Instagram or Facebook and open a chat.
2. Click on the ChatMate extension icon in your browser toolbar to open the popup.
3. Select the conversation mode and tone you prefer.
4. To get a chat recommendation:
   - Type or paste the message you're responding to in the input field
   - Click "Generate Response"
   - The suggested response will appear below
5. You can either:
   - Copy the response to clipboard and paste it manually
   - Click "Send to Chat" to automatically insert the response into the chat input field
6. Enable "Auto Reply" for the extension to automatically respond to incoming messages based on your selected settings.

## How It Works

ChatMate uses Google's Gemini AI to generate Hinglish responses:

1. When you enter a message, the extension sends a request to the Gemini API
2. The API generates a contextually appropriate response based on your conversation mode and tone
3. If the API is unavailable, the extension uses a fallback local response system
4. The extension formats all responses to ensure they have a natural Hinglish style
5. Responses can be automatically sent or manually copied to the chat

## Privacy

All conversation data is stored locally in your browser. When using the API:
- Only the current message and instructions are sent to Google's Gemini API
- No conversation history or personal data is transmitted
- API calls require your API key, which is stored securely in your browser

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This extension is not affiliated with Instagram, Facebook, Meta Platforms, Inc., or Google. 
