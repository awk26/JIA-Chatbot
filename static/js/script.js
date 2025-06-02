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
    {id: 'Test_DB', name: 'Test_DB'}
    
];

// Keep track of all messages
let chatHistory = [welcomeMessage];

// Store conversation ID for API tracking
let conversationId = generateUniqueId();

// Current selected category
let currentCategory = null;
let chartAndTableElements = [];
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
        
        if (Array.isArray(response.response) || (typeof response.response === "object" && response.response !== null)) {
            console.log("Processing array/object response");
           
            
            // Create a special message object for chart/table data
            const chartTableMessage = {
                content: "Data visualization generated",
                sender: "assistant",
                timestamp: getCurrentTimestamp(),
                isChartTable: true,
                chartTableData: {
                    response: response.response,
                    suggestions: response.suggestions || [],
                    chartData: response.chartData || null
                }
            };
            
            chatHistory.push(chartTableMessage);
            renderMessages();
            scrollToBottom();
            
            return null;
        } else {
            if (response !== null) {
                // Add assistant message to chat history
                const assistantMessage = {
                    content: response.response,
                    sender: "assistant",
                    timestamp: getCurrentTimestamp(),
                    sources: response.suggestion,
                    showCategories: response.show_menu
                };
                chatHistory.push(assistantMessage);
                
                // Render messages including the new response
                renderMessages();
                scrollToBottom();
            }
        }
        
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
        // console.log("chart data===============",message.chartTableData.response)
        // Handle chart/table messages specially
        if (message.isChartTable) {
            appendBotMessage(
                message.chartTableData.response, 
                message.chartTableData.suggestions, 
                message.chartTableData.chartData
            );
            return; // Skip the rest of the rendering for this message
        }
        
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
            logoImg.style.borderRadius = '50%';
            logoImg.style.objectFit = 'cover';
            logoImg.style.display = 'block';
            
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
        
        // Check if message has content and markdown-like formatting
        let messageContent = message.content || '';
        
        // Only process formatting if content exists
        if (messageContent) {
            // Convert ** bold ** to <strong>bold</strong>
            messageContent = messageContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Convert simple newlines to <br>
            messageContent = messageContent.replace(/\n/g, '<br>');
        }
        
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
        } else {
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
                    suggestionsTitle.textContent = 'References:';
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
    // Clear the stored chart/table elements
    chartAndTableElements = [];
    renderMessages();
    
    // Reset current category
    currentCategory = null;
}

// Modified startNewChat function
function startNewChat() {
    // Reset to just the welcome message
    chatHistory = [welcomeMessage];
    // Generate new conversation ID
    conversationId = generateUniqueId();
    // Clear the stored chart/table elements
    chartAndTableElements = [];
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
        
        
        console.log("wwwwwwwwwwwwwwwwwwwww",data.chartData)
        return {
            response: data.response || "I'm not sure how to respond to that.",
            chartData: data.chartData || null,
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
        // Check if user wants to continue previous session (you can add a setting for this)
        const continueSession = localStorage.getItem('continueSession') === 'true';
        
        if (continueSession) {
            const response = await fetch('/get-chat-history');
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && Array.isArray(data.history) && data.history.length > 0) {
                    chatHistory = data.history;
                    renderMessages();
                    scrollToBottom();
                    return;
                }
            }
        }
        
        // If not continuing session or no history found, start fresh
        chatHistory = [welcomeMessage];
        currentCategory = null;
        conversationId = generateUniqueId();
        chartAndTableElements = [];
        renderMessages();
        scrollToBottom();
        
    } catch (error) {
        console.error("Error loading chat history:", error);
        // Fallback to fresh start
        chatHistory = [welcomeMessage];
        currentCategory = null;
        renderMessages();
        scrollToBottom();
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




// Replace the appendBotMessage function with this updated version

function appendBotMessage(response, suggestions, chartData) {
    
    if (Array.isArray(response) && response.length > 0 && typeof response[0] === 'object') {
        const chartContainer = $("<div>").addClass("row").css({
            "width": "100%",
            "max-width": "100%",
            "overflow": "hidden",
            "box-sizing": "border-box"
        });

        // Create a control section with dropdown
        const controlSection = $("<div>").addClass("control-section").css({
            "display": "flex",
            "justify-content": "space-between",
            "align-items": "center",
            "margin-bottom": "15px",
            "width": "100%"
        });

        // Create export dropdown (keeping existing code)
        const exportDropdown = $("<div>").addClass("export-dropdown").css({
            "position": "relative",
            "display": "inline-block"
        });

        const exportBtn = $("<button>")
            .addClass("export-toggle-btn")
            .html('<i class="fas fa-download"></i> Export')
            .css({
                "padding": "8px 15px",
                "background-color": "#4CAF50",
                "color": "white",
                "border": "none",
                "border-radius": "4px",
                "cursor": "pointer",
                "font-weight": "bold"
            });

        const dropdownContent = $("<div>").addClass("export-dropdown-content").css({
            "display": "none",
            "position": "absolute",
            "background-color": "#f9f9f9",
            "min-width": "160px",
            "box-shadow": "0px 8px 16px 0px rgba(0,0,0,0.2)",
            "z-index": "1",
            "border-radius": "4px"
        });

        // Excel option
        const excelOption = $("<a>")
            .attr("id", "downloadExcel")
            .html('<i class="fas fa-file-excel"></i> Excel')
            .css({
                "color": "#217346",
                "padding": "12px 16px",
                "text-decoration": "none",
                "display": "block",
                "cursor": "pointer"
            });

        const pdfOption = $("<a>")
            .attr("id", "downloadPDF")
            .html('<i class="fas fa-file-pdf"></i> PDF')
            .css({
                "color": "#FF0000",
                "padding": "12px 16px",
                "text-decoration": "none",
                "display": "block",
                "cursor": "pointer"
            });

        // Print option
        const printOption = $("<a>")
            .attr("id", "printData")
            .html('<i class="fas fa-print"></i> Print')
            .css({
                "color": "#6C757D",
                "padding": "12px 16px",
                "text-decoration": "none",
                "display": "block",
                "cursor": "pointer"
            });

        // Add hover effect to dropdown items
        [excelOption, pdfOption, printOption].forEach(option => {
            option.hover(
                function () { $(this).css("background-color", "#f1f1f1"); },
                function () { $(this).css("background-color", "transparent"); }
            );
        });

        // Add options to dropdown
        dropdownContent.append(excelOption, pdfOption, printOption);
        exportDropdown.append(exportBtn, dropdownContent);

        // Toggle dropdown on click
        exportBtn.on("click", function () {
            dropdownContent.toggle();
        });

        // Close dropdown when clicking elsewhere
        $(document).on("click", function (event) {
            if (!$(event.target).closest(".export-dropdown").length) {
                dropdownContent.hide();
            }
        });

        controlSection.append(exportDropdown);
        chartContainer.append(controlSection);

        // FIXED: Updated table wrapper with proper constraints
        const tableWrapper = $("<div>").addClass("col-6").css({
            "width": "48%",                    // Fixed width instead of 50%
            "max-width": "48%",               // Ensure it doesn't exceed
            "min-width": "0",                 // Allow shrinking
            "padding-right": "1%",            // Small padding
            "box-sizing": "border-box",       // Include padding in width calculation
            "overflow": "hidden"              // Hide any overflow
        });

        // FIXED: Updated canvas wrapper
        const canvasWrapper = $("<div>").addClass("col-6").css({
            "width": "48%",                   // Fixed width instead of 50%
            "max-width": "48%",               // Ensure it doesn't exceed
            "min-width": "0",                 // Allow shrinking
            "padding-left": "1%",             // Small padding
            "box-sizing": "border-box",       // Include padding in width calculation
            "overflow": "hidden"              // Hide any overflow
        });

        // Chart type dropdown
        const chartControls = $("<div>").addClass("chart-controls").css({
            "display": "flex",
            "justify-content": "flex-end",
            "margin-bottom": "10px"
        });

        const dropdown = $("<select>").attr("id", "chartType").css({
            "width": "150px",
            "padding": "5px",
            "border-radius": "4px",
            "border": "1px solid #ccc"
        });

        const chartTypes = ["Bar", "Pie", "Line", "Doughnut"];
        chartTypes.forEach(type => {
            dropdown.append($("<option>").text(type).val(type.toLowerCase()));
        });

        chartControls.append(dropdown);
        canvasWrapper.append(chartControls);

        const tableId = 'responseTable_' + new Date().getTime();
        const table = $('<table>').attr('id', tableId).addClass('display').css({
            "width": "100%",
            "max-width": "100%",
            "table-layout": "fixed"  // FIXED: Force fixed table layout
        });
        
        let cookieColumns = getCookie("columns");
        let headers = Object.keys(response[0]).map(h => h.trim());
        if (cookieColumns) {
            cookieColumns = decodeURIComponent(cookieColumns.replace(/\\054/g, ","))
                .split(",")
                .map(h => h.replace(/^"|"$/g, "").trim());
            headers = cookieColumns.filter(col => headers.includes(col));
        }

        const thead = $("<thead>");
        const headerRow = $("<tr>");
        headers.forEach(header => {
            headerRow.append($("<th>").text(header).css({
                "word-wrap": "break-word",
                "overflow": "hidden",
                "text-overflow": "ellipsis"
            }));
        });
        thead.append(headerRow);
        table.append(thead);
        const tbody = $("<tbody>");

        response.forEach(row => {
            const tr = $('<tr>');
            headers.forEach(header => {
                tr.append($('<td>').text(row[header] || '').css({
                    "word-wrap": "break-word",
                    "overflow": "hidden",
                    "text-overflow": "ellipsis"
                }));
            });
            tbody.append(tr);
        });
        table.append(tbody);
        tableWrapper.append(table);
        chartContainer.append(tableWrapper);

        // Add the chart container to messages container
        $(messagesContainer).append(chartContainer);

        // FIXED: Initialize DataTable with updated settings
        initializeDataTable(tableId);

        const canvasId = "chart_" + new Date().getTime();
        let chart = null;

        if (chartData && chartData.labels && chartData.values) {
            const numericValues = chartData.values.map(v => {
                if (typeof v === "number") {
                    return v;
                }
                if (typeof v === "string") {
                    const num = parseFloat(v.replace(/[^0-9.-]+/g, ""));
                    return isNaN(num) ? 0 : num;
                }
                return 0;
            });

            const canvas = $("<canvas>").attr("id", canvasId).css({
                "max-width": "100%",
                "height": "auto"
            });
            canvasWrapper.append(canvas);
            chartContainer.append(canvasWrapper);

            function renderChart(type) {
                if (chart) {
                    chart.destroy();
                }
                const ctx = canvas[0].getContext("2d");
                canvas.attr("class", ""); // Reset Class
                canvas.addClass("myChart"); // Common Class
                if (type === "pie" || type === "doughnut") {
                    canvas.addClass(`${type}-chart`);
                }
                chart = new Chart(ctx, {
                    type: type,
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: "Chart Data",
                            data: numericValues,
                            borderWidth: 1,
                            backgroundColor: [
                                'rgba(255, 99, 132, 0.7)',
                                'rgba(54, 162, 235, 0.7)',
                                'rgba(255, 206, 86, 0.7)',
                                'rgba(75, 192, 192, 0.7)',
                                'rgba(153, 102, 255, 0.7)',
                                'rgba(255, 159, 64, 0.7)'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Data Visualization'
                            }
                        }
                    }
                });
            }

            renderChart("bar");
            dropdown.on("change", function () {
                const selectedType = $(this).val();
                renderChart(selectedType);
            });
        }

        // Rest of the export functionality remains the same...
        // [Include all the existing export handlers here]
        
    } else {
        // Handle text or structured response (existing code remains the same)
        const messageDiv = $("<div>").addClass("chat-message bot");
        const messageContent = $("<div>").addClass("message bot").css("margin-top", "20px");

        if (typeof response === 'object' && response !== null) {
            if (response.text) {
                const formattedText = formatMarkdown(response.text);
                messageContent.html(formattedText);
            }

            if (response.code) {
                const codeBlock = $("<div>").addClass("code-block");
                const codeHeader = $("<div>").addClass("code-header");

                if (response.language) {
                    codeHeader.append($("<span>").addClass("code-language").text(response.language));
                }

                const copyButton = $("<button>").addClass("copy-code-btn").text("Copy code");
                copyButton.on("click", function () {
                    navigator.clipboard.writeText(response.code);
                    $(this).text("Copied!");
                    setTimeout(() => $(this).text("Copy code"), 2000);
                });

                codeHeader.append(copyButton);
                codeBlock.append(codeHeader);

                const codeContent = $("<pre>").append($("<code>").text(response.code));
                codeBlock.append(codeContent);

                messageContent.append(codeBlock);
            }
        } else {
            const formattedText = formatMarkdown(response);
            messageContent.html(formattedText);
        }

        messageDiv.append(messageContent);
        messagesContainer.append(messageDiv);
    }
}

// FIXED: Updated initializeDataTable function
function initializeDataTable(tableId) {
    return $('#' + tableId).DataTable({
        scrollX: false,              // FIXED: Disable horizontal scroll completely
        scrollY: "400px",            // Keep vertical scroll for height control
        fixedHeader: false,          // FIXED: Disable fixed header to prevent layout issues
        paging: true,
        searching: true,
        scrollCollapse: true,
        autoWidth: false,            // FIXED: Prevent auto width calculation
        responsive: false,           // FIXED: Disable responsive to prevent column manipulation
        columnDefs: [
            {
                targets: '_all',
                width: 'auto',           // FIXED: Let columns auto-size within container
                className: 'text-center'
            }
        ],
        language: {
            search: "Search:",
            paginate: {
                previous: "Previous",
                next: "Next"
            }
        },
        // FIXED: Add these settings to prevent overflow
        layout: {
            topStart: null,
            topEnd: 'search',
            bottomStart: 'info',
            bottomEnd: 'paging'
        }
    });
}




function formatMarkdown(text) {
    if (!text) return '';
    
    // Basic markdown formatting
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
        .replace(/\n/g, '<br>');                           // Line breaks
    
    return formatted;
}


function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}    


function initializeDataTable(tableId) {
    return $('#' + tableId).DataTable({
        scrollX: false,        // Disable horizontal scroll - this was causing the issue
        scrollY: "400px",      // Optional: Add vertical scroll if table is too tall
        fixedHeader: true,
        paging: true,
        searching: true,
        scrollCollapse: true,
        autoWidth: false,      // Prevent auto width calculation
        columnDefs: [
            {
                targets: '_all',   // Apply to all columns
                width: '50px',     // Let columns size automatically within container
                className: 'text-center'  // Center align text
            }
        ],
        language: {
            search: "Search:",
            paginate: {
                previous: "Previous",
                next: "Next"
            }
        },
        // Add responsive behavior
        responsive: {
            details: false  // Disable responsive details to prevent column hiding
        }
    });
}

scrollToBottom();
loadChatHistory();