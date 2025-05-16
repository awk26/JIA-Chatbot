// DOM elements
const messagesContainer = document.getElementById('messages-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const newChatButton = document.getElementById('new-chat-button');
const typingIndicator = document.getElementById('typing-indicator');
const backToMenuButton = document.getElementById('back-to-menu-button');

// Initial welcome message
const welcomeMessage = {
    content: "Hi! Welcome to JMB Group, I am JIA - JMB Intelligent Assistant. How can I help you today?",
    sender: "assistant",
    timestamp: getCurrentTimestamp()
};

// Category buttons to be displayed after welcome message
const categoryOptions = [
    { id: 'HR Policy', name: 'HR Policy' },
    { id: 'IT Policy', name: 'IT Policy' },
    { id: 'SOP', name: 'SOP', dropdown: true, options: [
        { id: 'SOPP_Operation', name: 'Operation' },
        { id: 'SOPP_Procurement', name: 'Procurement' },
        { id: 'SOPP_Revenue', name: 'Revenue' },
        { id: 'SOPP_Sales', name: 'Sales' }
    ]},
    
];

// Keep track of all messages
let chatHistory = [welcomeMessage];

// Store conversation ID for API tracking
let conversationId = generateUniqueId();

// Current selected category
let currentCategory = null;

// Render initial message
renderMessages();

// Event listeners
userInput.addEventListener('input', handleInput);
userInput.addEventListener('keydown', handleKeyDown);
sendButton.addEventListener('click', sendMessage);
clearButton.addEventListener('click', clearChat);
newChatButton.addEventListener('click', startNewChat);
backToMenuButton.addEventListener('click', showCategories);

// Auto-resize textarea as user types
function handleInput() {
    // Enable/disable send button based on input content
    sendButton.disabled = userInput.value.trim() === '';
    
    // Auto-resize the textarea
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight < 200 ? userInput.scrollHeight : 200) + 'px';
}

function handleKeyDown(e) {
    // Send message on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (userInput.value.trim() !== '') {
            sendMessage();
        }
    }
}

function createCategoryButtons() {
    const categoriesContainer = document.createElement('div');
    // categoriesContainer.className = 'categories-container';
    
    const categoryTitle = document.createElement('div');
    categoryTitle.className = 'category-title';
    // categoryTitle.textContent = 'Please select a category:';
    categoriesContainer.appendChild(categoryTitle);
    
    const categoryButtonsContainer = document.createElement('div');
    categoryButtonsContainer.className = 'category-buttons-container';
    
    categoryOptions.forEach(category => {
        if (category.dropdown) {
            // Create dropdown for SOP
            const dropdownContainer = document.createElement('div');
            dropdownContainer.className = 'dropdown';
            
            const dropdownButton = document.createElement('button');
            dropdownButton.className = 'category-button dropdown-toggle';
            dropdownButton.setAttribute('data-category', category.id);
            dropdownButton.textContent = category.name;
            
            const dropdownContent = document.createElement('div');
            dropdownContent.className = 'dropdown-content';
            
            category.options.forEach(option => {
                const optionButton = document.createElement('button');
                optionButton.className = 'category-button sub-option';
                optionButton.setAttribute('data-category', option.id);
                optionButton.textContent = option.name;
                optionButton.addEventListener('click', function() {
                    selectCategory(option.id, `${category.name} - ${option.name}`);
                });
                dropdownContent.appendChild(optionButton);
            });
            
            dropdownButton.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdownContainer.classList.toggle('active');
            });
            
            dropdownContainer.appendChild(dropdownButton);
            dropdownContainer.appendChild(dropdownContent);
            categoryButtonsContainer.appendChild(dropdownContainer);
        } else {
            // Create regular button
            const button = document.createElement('button');
            button.className = 'category-button';
            button.setAttribute('data-category', category.id);
            button.textContent = category.name;
            button.addEventListener('click', function() {
                selectCategory(category.id, category.name);
            });
            categoryButtonsContainer.appendChild(button);
        }
    });
    
    categoriesContainer.appendChild(categoryButtonsContainer);
    return categoriesContainer;
}

function selectCategory(categoryId, displayName) {
    // Set active category
    currentCategory = categoryId;
    
    // Add user message showing selection
    const userMessage = {
        content: displayName,
        sender: "user",
        timestamp: getCurrentTimestamp()
    };
    chatHistory.push(userMessage);
    
    // Add system message indicating category selection
    const systemMessage = {
        content: `You've selected ${displayName}. You can now ask questions related to this category.`,
        sender: "assistant",
        timestamp: getCurrentTimestamp()
    };
    chatHistory.push(systemMessage);
    
    // Render messages
    renderMessages();
    scrollToBottom();
    
    // Send category selection to backend
    fetch('/set-category', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'category': categoryId
        })
    })
    .catch(error => {
        console.error("Error setting category:", error);
    });
}

function showCategories() {
    // Add system message
    const systemMessage = {
        content: "I've returned to the main menu. What would you like to know about?",
        sender: "assistant",
        timestamp: getCurrentTimestamp(),
        showCategories: true  // Flag to show categories
    };
    
    chatHistory.push(systemMessage);
    renderMessages();
    scrollToBottom();
}

async function sendMessage() {
    if (userInput.value.trim() === '') return;
    
    // Add user message to chat history
    const userMessage = {
        content: userInput.value.trim(),
        sender: "user",
        timestamp: getCurrentTimestamp()
    };
    chatHistory.push(userMessage);
    
    // Clear input and reset height
    userInput.value = '';
    userInput.style.height = 'auto';
    sendButton.disabled = true;
    
    // Render messages including the new one
    renderMessages();
    scrollToBottom();
    
    // Process user message
    await processUserMessage(userMessage.content);
}

async function processUserMessage(message) {
    // Show typing indicator
    typingIndicator.classList.add('active');
    
    try {
        // Disable inputs while waiting for response
        userInput.disabled = true;
        sendButton.disabled = true;
        
        // Call the API endpoint to get the assistant's response
        const response = await fetchAIResponse(message);
        
        // Hide typing indicator
        typingIndicator.classList.remove('active');
        
        // Add assistant message to chat history
        const assistantMessage = {
            content: response.response,
            sender: "assistant",
            timestamp: getCurrentTimestamp(),
            sources: response.suggestion, // This can contain source documents or suggestions
            showCategories: response.show_menu // This indicates whether to show category buttons
        };
        chatHistory.push(assistantMessage);
        
        // Render messages including the new response
        renderMessages();
        scrollToBottom();
    } catch (error) {
        // Hide typing indicator
        typingIndicator.classList.remove('active');
        
        // Show error message
        const errorMessage = {
            content: "Sorry, I couldn't process your request. Please try again later.",
            sender: "assistant",
            timestamp: getCurrentTimestamp()
        };
        chatHistory.push(errorMessage);
        
        // Render messages including the error
        renderMessages();
        scrollToBottom();
        console.error("Error fetching AI response:", error);
    } finally {
        // Re-enable inputs
        userInput.disabled = false;
        userInput.focus();
        handleInput(); // Reset send button state
    }
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    
    chatHistory.forEach((message, index) => {
        const isUser = message.sender === 'user';
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isUser ? 'user' : 'assistant'}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (isUser) {
            avatar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        } else {
            // Use JIA logo for assistant messages in a circular format
            const logoImg = document.createElement('img');
            logoImg.src = '/static/image/JIA!.png';
            logoImg.alt = 'JIA Logo';
            logoImg.style.width = '24px';
            logoImg.style.height = '24px';
            logoImg.style.borderRadius = '50%'; // Make the image circular
            logoImg.style.objectFit = 'cover'; // Ensure the image fills the circle
            logoImg.style.display = 'block'; // Remove any inline spacing
            
            // Add the image to the avatar div
            avatar.style.display = 'flex';
            avatar.style.alignItems = 'center';
            avatar.style.justifyContent = 'center';
            avatar.appendChild(logoImg);
        }
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = isUser ? 'You' : 'JIA';
        
        const text = document.createElement('div');
        text.className = 'message-text';
        
        // Check if message has markdown-like formatting
        let messageContent = message.content;
        // Convert ** bold ** to <strong>bold</strong>
        messageContent = messageContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Convert simple newlines to <br>
        messageContent = messageContent.replace(/\n/g, '<br>');
        
        text.innerHTML = messageContent;
        
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = message.timestamp || '';
        
        content.appendChild(sender);
        content.appendChild(text);
        
        // Add category buttons if it's the welcome message or if showCategories is true
        if (!isUser && (index === 0 || message.showCategories)) {
            const categoriesContainer = createCategoryButtons();
            content.appendChild(categoriesContainer);
            content.appendChild(timestamp);
        
        }else{
            content.appendChild(timestamp);
        }
        
        
        // Add sources if available
        if (message.sources && !isUser) {
            const sourcesContainer = document.createElement('div');
            sourcesContainer.className = 'message-sources';
            
            // Check if sources is an array of objects or array of strings
            if (Array.isArray(message.sources)) {
                if (message.sources.length > 0 && typeof message.sources[0] === 'object') {
                    // It's an array of source objects
                    const sourcesTitle = document.createElement('div');
                    sourcesTitle.className = 'source-title';
                    sourcesTitle.textContent = 'Sources:';
                    sourcesContainer.appendChild(sourcesTitle);
                    
                    message.sources.forEach(source => {
                        const sourceItem = document.createElement('div');
                        sourceItem.className = 'source-item';
                        sourceItem.textContent = `${source.category || ''} - ${source.document || ''} ${source.page ? `(Page ${source.page})` : ''}`.trim();
                        sourcesContainer.appendChild(sourceItem);
                    });
                } else {
                    // It's an array of suggestion strings
                    const suggestionsContainer = document.createElement('div');
                    suggestionsContainer.className = 'message-suggestions';
                    
                    const suggestionsTitle = document.createElement('div');
                    suggestionsTitle.className = 'suggestion-title';
                    suggestionsTitle.textContent = 'Suggested queries:';
                    suggestionsContainer.appendChild(suggestionsTitle);
                    
                    message.sources.forEach(suggestion => {
                        if (typeof suggestion === 'string') {
                            const suggestionItem = document.createElement('div');
                            suggestionItem.className = 'suggestion-item';
                            suggestionItem.textContent = suggestion;
                            suggestionItem.addEventListener('click', () => {
                                userInput.value = suggestion;
                                handleInput();
                                userInput.focus();
                            });
                            suggestionsContainer.appendChild(suggestionItem);
                        } else if (suggestion.tip) {
                            const suggestionItem = document.createElement('div');
                            suggestionItem.className = 'suggestion-item';
                            suggestionItem.textContent = suggestion.tip;
                            suggestionsContainer.appendChild(suggestionItem);
                        }
                    });
                    
                    content.appendChild(suggestionsContainer);
                }
            } else if (typeof message.sources === 'string') {
                // It's a single string message
                sourcesContainer.textContent = message.sources;
            }
            
            content.appendChild(sourcesContainer);
        }
        
        messageElement.appendChild(avatar);
        messageElement.appendChild(content);
        
        messagesContainer.appendChild(messageElement);
    });
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function clearChat() {
    // Reset to just the welcome message
    chatHistory = [welcomeMessage];
    renderMessages();
    
    // Reset current category
    currentCategory = null;
}

function startNewChat() {
    // Reset to just the welcome message
    chatHistory = [welcomeMessage];
    // Generate new conversation ID
    conversationId = generateUniqueId();
    renderMessages();
    
    // Reset current category
    currentCategory = null;
}

// Generate a unique ID for conversation tracking
function generateUniqueId() {
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Get current timestamp
function getCurrentTimestamp() {
    const now = new Date();
    return now.toLocaleString('en-US', { 
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        day: 'numeric',
        month: 'short'
    });
}

// Function to fetch AI response from API
async function fetchAIResponse(userMessage) {
    try {
        const response = await fetch('/get-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'message': userMessage
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return {
            response: data.response || "I'm not sure how to respond to that.",
            suggestion: data.suggestion || [],
            show_menu: data.show_menu || false,
            timestamp: data.timestamp || getCurrentTimestamp()
        };
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// Load chat history on startup if available
async function loadChatHistory() {
    try {
        const response = await fetch('/get-chat-history');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && Array.isArray(data.history) && data.history.length > 0) {
                chatHistory = data.history;
                renderMessages();
                scrollToBottom();
            }
        }
    } catch (error) {
        console.error("Error loading chat history:", error);
    }
}

// Add click event delegation to handle dynamically added elements
document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('suggestion-item')) {
        const suggestionText = e.target.textContent;
        userInput.value = suggestionText;
        handleInput();
        sendMessage();
    }
});

// Initialize
scrollToBottom();
loadChatHistory();