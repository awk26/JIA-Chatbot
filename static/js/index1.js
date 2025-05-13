function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

$(document).ready(function () {
    const sendButton = $("#send-btn");
    const userInput = $("#user-input");
    const chatBox = $("#chat-box");
    const voiceButton = $("#voice-btn");
    const fileInput = $("#file-input");
    const inputContainer = $(".input-container");
    const suggestionsContainer = $("#suggestions");

    // File upload functionality
    fileInput.on("change", function () {
        displaySelectedFiles(this.files);
    });

    // In your index1.js file, modify the displaySelectedFiles function:

    // function displaySelectedFiles(files) {
    //     // Remove any existing file badges
    //     $(".file-badges").remove();
    
    //     if (files.length > 0) {
    //         // Create file badges container
    //         const fileBadgesContainer = $("<div>").addClass("file-badges").css({
    //             "margin-bottom": "5px",
    //             "display": "flex",
    //             "flex-wrap": "wrap",
    //             "gap": "5px",
    //             "width": "100%"
    //         });
    
    //         // Add each file as a badge
    //         Array.from(files).forEach(file => {
    //             const badge = $("<span>").addClass("file-badge").css({
    //                 "background-color": "#e9e9e9",
    //                 "border-radius": "4px",
    //                 "padding": "2px 8px",
    //                 "font-size": "12px",
    //                 "display": "inline-flex",
    //                 "align-items": "center",
    //                 "margin-right": "5px",
    //                 "margin-bottom": "5px"
    //             })
    //             .append($("<i>").addClass("fas fa-file").css("margin-right", "5px"))
    //             .append(document.createTextNode(file.name));
                
    //             fileBadgesContainer.append(badge);
    //         });
    
    //         // Make sure the input-container is set to flex-column
    //         $(".input-container").css({
    //             "display": "flex",
    //             "flex-direction": "column"
    //         });
            
    //         // Insert file badges at the beginning of input-container
    //         $(".input-container").prepend(fileBadgesContainer);
            
    //         // Make sure the input-wrapper takes full width
    //         $(".input-wrapper").css("width", "100%");
            
    //         // Reset padding on input field since badges are outside now
    //         $("#user-input").css("padding-top", "10px");
    //     }
    // }

    function startListening() {
        if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
            console.log("Speech Recognition API is not supported in this browser.");
            return;
        }

        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = "en-US";
        recognition.start();
        recognition.onstart = function () {
            console.log("Voice recognition started. Speak now.");
        };

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            console.log("Recognized Speech: ", transcript);
            $("#user-input").val(transcript);
            $("#send-btn").click(); // Auto-send message
        };

        recognition.onspeechend = function () {
            recognition.stop();
            console.log("Speech recognition ended.");
        };

        recognition.onerror = function (event) {
            console.log("Speech recognition error:", event.error);
            if (event.error === "not-allowed") {
                alert("Microphone access is blocked. Please enable it in your browser settings.");
            }
        };
    }

    // Add click event listener to voice button
    voiceButton.on("click", startListening);

    // Text-to-Speech (Voice Output)
    function speakText(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        speechSynthesis.speak(utterance);
    }

    function appendMessage(text, sender, files) {
        const messageDiv = $("<div>").addClass(`chat-message ${sender}`);
    
        // Create the message content div
        const messageContent = $("<div>")
            .addClass(`message ${sender}`)
            .css("margin-top", "20px");
    
        // If there are files, prepend them to the message content
        if (files && files.length > 0) {
            const filesContainer = $("<div>").addClass("files-container");
    
            Array.from(files).forEach(file => {
                // Create a file preview element
                const fileElement = $("<div>").addClass("file-preview");
    
                // Create a blob URL for the file
                const fileUrl = URL.createObjectURL(file);
    
                // Make the file element clickable
                fileElement.on("click", function () {
                    window.open(fileUrl, '_blank');
                });
    
                // Add file icon based on type
                const fileIcon = $("<i>").addClass("fas fa-file");
                if (file.type.includes("pdf")) {
                    fileIcon.removeClass("fa-file").addClass("fa-file-pdf");
                } else if (file.type.includes("image")) {
                    fileIcon.removeClass("fa-file").addClass("fa-file-image");
                } else if (file.type.includes("text")) {
                    fileIcon.removeClass("fa-file").addClass("fa-file-alt");
                }
    
                // Add filename
                const fileName = $("<span>").addClass("file-name").text(file.name);
    
                fileElement.append(fileIcon).append(fileName);
                filesContainer.append(fileElement);
            });
    
            // Add the files container to the message content
            messageContent.append(filesContainer);
            
            // Add the text if there is any
            if (text && text.trim() !== "") {
                messageContent.append($("<div>").html(text)); // Use html instead of text to preserve formatting
            }
        } else {
            // If no files, just add the text
            messageContent.text(text);
        }
    
        messageDiv.append(messageContent);
        chatBox.append(messageDiv);
        chatBox.scrollTop(chatBox.prop("scrollHeight"));
    }

    // Function to format markdown text
    function formatMarkdown(text) {
        if (!text) return '';

        // Bold text
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic text
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Headers
        text = text.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

        // Lists - unordered
        text = text.replace(/^- (.*?)$/gm, '<li>$1</li>');
        text = text.replace(/<li>.*?<\/li>(?!\n<li>)/gs, match => {
            if (match.length > 0) return '<ul>' + match + '</ul>';
            return match;
        });

        // Lists - ordered
        text = text.replace(/^(\d+)\. (.*?)$/gm, '<li>$2</li>');
        text = text.replace(/<li>.*?<\/li>(?!\n<li>)/gs, match => {
            if (match.length > 0 && !match.includes('<ul>')) return '<ol>' + match + '</ol>';
            return match;
        });

        // Code blocks
        text = text.replace(/```(.*?)\n([\s\S]*?)```/g, function (match, language, code) {
            const safeCode = code.replace(/'/g, "\\'").replace(/"/g, '\\"');
            return `
            <div class="code-block">
                <div class="code-header">
                    <span class="code-language">${language || 'plain'}</span>
                    <button class="copy-code-btn" onclick="copyCode(this, '${safeCode}')">Copy code</button>
                </div>
                <pre><code>${code}</code></pre>
            </div>`;
        });

        // Inline code
        text = text.replace(/`(.*?)`/g, '<code>$1</code>');

        // Line breaks
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    // Function to copy code to clipboard
    window.copyCode = function (button, code) {
        navigator.clipboard.writeText(code);
        $(button).text("Copied!");
        setTimeout(() => $(button).text("Copy code"), 2000);
    };


    function appendBotMessage(response, suggestions, chartData) {
        removeLoadingIndicator();
      
        if (Array.isArray(response) && response.length > 0) {
            const chartContainer = $("<div>").addClass("row");

            const tableWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto", // Makes table scrollable if content is large
                "padding-right": "20px" // Add margin between table and chart
            });
            const canvasWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto",
            });

            const dropdown = $("<select>").attr("id", "chartType").css({
                "marginBottom": "10px",
                "width": "150px",
                "display": "inline-block",
                "float": "right",
                "marginRight": "20px"
            });

            const chartTypes = ["Bar", "Pie", "Line", "Doughnut"];
            chartTypes.forEach(type => {
                dropdown.append($("<option>").text(type).val(type.toLowerCase()));
            });

            canvasWrapper.append(dropdown).append("<br>");
            canvasWrapper.append(dropdown);
            canvasWrapper.css("text-align", "right");
            const tableId = 'responseTable_' + new Date().getTime();
            const table = $('<table>').attr('id', tableId).addClass('display');
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
                headerRow.append($("<th>").text(header));
            });
            thead.append(headerRow);
            table.append(thead);
            const tbody = $("<tbody>");

            response.forEach(row => {
                const tr = $('<tr>');
                headers.forEach(header => tr.append($('<td>').text(row[header] || '')));
                tbody.append(tr);
            });
            table.append(tbody);
            tableWrapper.append(table);
            chartContainer.append(tableWrapper);

            chatBox.append(chartContainer);

            $('#' + tableId).DataTable({
                scrollX: true, // Enable Horizontal Scroll
                fixedHeader: true, // Fix Header
                paging: true, // Enable Pagination
                searching: true, // Enable Search Box
                scrollCollapse: true,
                autoWidth: false,
                language: {
                    search: "Search:",
                    paginate: {
                        previous: "Previous",
                        next: "Next"
                    }
                }
            });

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

                const canvas = $("<canvas>").attr("id", "myChart")
                canvasWrapper.append(canvas);
                chartContainer.append(canvasWrapper);

                let chart;

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
                                borderWidth: 1
                            }]
                        },
                        options: { responsive: true },
                        maintainAspectRatio: false
                    });
                }

                renderChart("bar");
                dropdown.on("change", function () {
                    const selectedType = $(this).val();
                    renderChart(selectedType);
                });
            }
        } else {
            // Handle text or structured response
            const messageDiv = $("<div>").addClass("chat-message bot");
            const messageContent = $("<div>").addClass("message bot").css("margin-top", "20px");

            if (typeof response === 'object' && response !== null) {
                // Handle structured response object
                if (response.text) {
                    const formattedText = formatMarkdown(response.text);
                    messageContent.html(formattedText);
                }

                // Handle code blocks
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
                // Handle simple text response with markdown formatting
                const formattedText = formatMarkdown(response);
                messageContent.html(formattedText);
            }

            messageDiv.append(messageContent);
            chatBox.append(messageDiv);
        }

        displaySuggestions(suggestions);
        chatBox.scrollTop(chatBox.prop("scrollHeight"));
    }
    function displaySuggestions(suggestions) {
      
        suggestionsContainer.empty();

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            console.log("No suggestions available.");
            return;
        }

        suggestions.forEach(question => {
            const button = $("<button>")
                .addClass("suggestion")
                .text(question)
                .on("click", function () {
                    $("#user-input").val(question);
                    $("#send-btn").click();
                });
            suggestionsContainer.append(button);
        });
    }
    function displaySelectedFiles(files) {
        // Remove any existing file badges from input area
        $(".input-container .file-badges").remove();
    
        if (files.length > 0) {
            // Create file badges container
            const fileBadgesContainer = $("<div>").addClass("file-badges").css({
                "display": "flex",
                "flex-wrap": "wrap",
                "gap": "5px",
                "margin-bottom": "5px",
                "width": "100%"
            });
    
            // Add each file as a badge
            Array.from(files).forEach(file => {
            const badge = $("<span>").addClass(" file-badge").css({
                    "background-color": "#e9e9e9",
                    "border-radius": "4px",
                    "padding": "2px 8px",
                    "font-size": "12px",
                    "display": "inline-flex",
                    "align-items": "center",
                    "margin-right": "5px"
                })
                .append($("<i>").addClass("fas fa-file").css("margin-right", "5px"))
                .append(document.createTextNode(file.name));
                
                fileBadgesContainer.append(badge);
            });
    
            // Create a wrapper div for input area elements
            const inputWrapper = $("<div>").addClass("input-wrapper").css({
                "display": "flex",
                "width": "100%",
                "align-items": "center"
            });
            
            // Temporarily detach all input elements
            const attachButton = $(".attach-button").detach();
            const userInput = $("#user-input").detach();
            const micIcon = $(".mic-icon").detach();
            const sendBtn = $("#send-btn").detach();
            $(".input-container").css({"flex-direction": "column"})
            // Clear the input container and rebuild it
            $(".input-container").empty();
            
            // Add file badges at the top of input container
            $(".input-container").append(fileBadgesContainer);
            
            // Add input wrapper with all the controls
            inputWrapper.append(attachButton).append(userInput).append(micIcon).append(sendBtn);
            $(".input-container").append(inputWrapper);
        }
    }

    function showLoadingIndicator() {
        sendButton.prop("disabled", true);
        userInput.prop("disabled", true);
        appendMessage("Loading...", "bot");
    }

    function removeLoadingIndicator() {
        $(".chat-message.bot .message").filter(function () {
            return $(this).text() === "Loading...";
        }).parent().remove();
        sendButton.prop("disabled", false);
        userInput.prop("disabled", false);
    }

    function sendMessage() {
        const message = userInput.val().trim();
        const files = $("#file-input")[0].files; // Get uploaded files
    
        if (!message && files.length === 0) return; // Check if both message and files are empty
    
        // Display the message to the user with files ONLY if files exist
        appendMessage(message, "user", files.length > 0 ? files : null);
    
        userInput.val("");
        sendButton.prop("disabled", true);
        showLoadingIndicator();
    
        // Create FormData for the AJAX request
        const formData = new FormData();
        formData.append('message', message);
    
        // Important: Make sure files are being added to the FormData
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
    
        // Send the AJAX request with the FormData
        $.ajax({
            url: "/get_response",
            method: "POST",
            processData: false, // Important for FormData
            contentType: false, // Important for FormData
            data: formData,
            success: function (data) {
                removeLoadingIndicator();
                
                appendBotMessage(data.response, data.suggestions || [], data.chartData || null);
                // Clear file badges after sending
                $(".input-container .file-badges").empty();
                $("#file-input")[0].value = ''; // Clear file input
               
                // Reset input container to original state
                resetInputContainer();
            },
            error: function () {
                removeLoadingIndicator();
                appendBotMessage("Error: Unable to connect to the server.");
                // Clear file badges on error too
                $("#file-input")[0].value = ''; // Clear file input
                $(".input-container .file-badges").remove(); // Remove file badges
                
                // Reset input container to original state
                resetInputContainer();
            }
        });
    }

    function resetInputContainer() {
        const inputContainer = $(".input-container");
        
        // If we have stored the original HTML, restore it
        if (inputContainer.data("original-html")) {
           
            // Temporarily detach elements we want to keep references to
            const userInput = $("#user-input").detach();
            const sendBtn = $("#send-btn").detach();
            
            // Restore original structure
            inputContainer.html(inputContainer.data("original-html"));
            
            // If the original elements are no longer in the DOM, add them back
            if ($("#user-input").length === 0) {
                inputContainer.find(".input-wrapper").append(userInput);
            }
            
            if ($("#send-btn").length === 0) {
                inputContainer.find(".input-wrapper").append(sendBtn);
            }
            
            // Clear the stored original HTML
            inputContainer.removeData("original-html");
        }
        
        // Make sure all file badges are removed
        $(".file-badges").remove();
        
        // Reset file input
        $("#file-input")[0].value = '';
    }
    
    sendButton.on("click", sendMessage);

    userInput.on("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    userInput.on("input", function () {
        const isEmpty = userInput.val().trim() === "" && $("#file-input")[0].files.length === 0;
        sendButton.prop("disabled", isEmpty);
    });

    // File drag and drop handling
    const fileDropzone = document.getElementById("file-dropzone");
    if (fileDropzone) {
        fileDropzone.addEventListener("click", function () {
            fileInput.click();
        });

        fileDropzone.addEventListener("dragover", function (e) {
            e.preventDefault();
            fileDropzone.classList.add("dragover");
        });

        fileDropzone.addEventListener("dragleave", function () {
            fileDropzone.classList.remove("dragover");
        });

        fileDropzone.addEventListener("drop", function (e) {
            e.preventDefault();
            fileDropzone.classList.remove("dragover");

            if (e.dataTransfer.files.length > 0) {
                fileInput[0].files = e.dataTransfer.files;
                displaySelectedFiles(e.dataTransfer.files);
            }
        });
    }

    // Show/hide file upload container
    $(".attach-button").on("click", function () {
        fileInput.click();
    });

    // Clear file input when closing the file upload container
    $("#close-upload, #cancel-upload").on("click", function () {
        fileInput[0].value = '';
        $(".file-badges").remove();
    });

    // Handle file selection directly from paperclip icon
    $(".fa-paperclip").parent().on("click", function () {
        fileInput.click();
    });

    // Enable send button when files are selected
    fileInput.on("change", function () {
        const hasFiles = this.files.length > 0;
        const hasText = userInput.val().trim() !== "";
        sendButton.prop("disabled", !hasFiles && !hasText);
        displaySelectedFiles(this.files);
    });
});