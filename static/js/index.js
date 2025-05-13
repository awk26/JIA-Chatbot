
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

$(document).ready(function () {
    const sendButton = $("#send-btn");
    const userInput = $("#user-input");
    const chatBox = $("#chat-box");
    const voiceButton = document.getElementById("voice-btn");
    const suggestionsContainer = $("#suggestions");

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
    voiceButton.addEventListener("click", startListening);

    // **Text-to-Speech (Voice Output)**
    function speakText(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        speechSynthesis.speak(utterance);
    }

    function appendMessage(text, sender) {
        const messageDiv = $("<div>").addClass(`chat-message ${sender}`);
        const messageContent = $("<div>")
            .addClass(`message ${sender}`)
            .text(text)
            .css("margin-top", "20px");
        messageDiv.append(messageContent);
        chatBox.append(messageDiv);
        // speakText(text);
        chatBox.scrollTop(chatBox.prop("scrollHeight"));
    }
    
    
    

    function appendBotMessage(response, suggestions, chartData) {
        removeLoadingIndicator();

        // if  (Array.isArray(response) && response.length > 0)  {
        //     const chartContainer = $("<div>").css({
        //         display: "flex",
        //         "justify-content": "space-between",
        //         "align-items": "flex-start",
        //         "margin-top": "20px",
        //         "gap": "40px"
        //     });
        if  (Array.isArray(response) && response.length > 0)  {
            const chartContainer = $("<div>").addClass("row");

            // const tableWrapper = $("<div>").css({ width: "50%" });
            // const canvasWrapper = $("<div>").css({ width: "100%", position: "relative" ,height:"300px"});
            const tableWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto", // Makes table scrollable if content is large
                "padding-right": "20px" // Add margin between table and chart
            });
            const canvasWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto",
                 
            });
            
            const dropdown = $("<select>").attr("id", "chartType").css({
            //     position: "absolute",
            //     top: "0",
            //     right: "0",
            //     padding: "5px",
            //     "border-radius": "5px",
            //     "background-color": "#f1f1f1",
            //     "border": "1px solid #ccc"
           
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
                                // backgroundColor: [
                                //     "rgba(4, 37, 37, 0.5)",
                                //     "rgba(255, 99, 132, 0.5)",
                                //     "rgba(255, 205, 86, 0.5)",
                                //     "rgba(153, 102, 255, 0.5)",
                                //     "rgba(54, 162, 235, 0.5)"
                                // ],
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
        }else {
            // If response is plain text, show it in the chatbox
            appendMessage(response, "bot");
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
        if (!message) return;

        appendMessage(message, "user");
        userInput.val("");
        sendButton.prop("disabled", true);
        showLoadingIndicator();

        $.ajax({
            url: "/get_response",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ message }),
            success: function (data) {
                console.log(data);
                removeLoadingIndicator();
                appendBotMessage(data.response, data.suggestions || [], data.chartData || null);
            },
            error: function () {
                removeLoadingIndicator();
                appendBotMessage("Error: Unable to connect to the server.", []);
            }
        });
    }

    sendButton.on("click", sendMessage);

    userInput.on("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    userInput.on("input", function () {
        sendButton.prop("disabled", userInput.val().trim() === "");
    });
});






















