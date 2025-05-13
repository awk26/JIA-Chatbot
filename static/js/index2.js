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

    let isFileInputProcessing = false;

    fileInput.on("change", function () {
        if (isFileInputProcessing) return; // Prevent double triggering
        isFileInputProcessing = true;

        displaySelectedFiles(this.files);

        setTimeout(() => {
            isFileInputProcessing = false; // Reset flag
        }, 100);
    });

    
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

    function initializeDataTable(tableId) {
        return $('#' + tableId).DataTable({
            scrollX: true,
            fixedHeader: true,
            paging: true,
            searching: true,
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
    }


  
    function appendBotMessage(response, suggestions, chartData) {
        removeLoadingIndicator();

        if (Array.isArray(response) && response.length > 0) {
            const chartContainer = $("<div>").addClass("row");

            // Create a control section with dropdown
            const controlSection = $("<div>").addClass("control-section").css({
                "display": "flex",
                "justify-content": "space-between",
                "align-items": "center",
                "margin-bottom": "15px",
                "width": "100%"
            });

            // Create export dropdown
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

            const tableWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto",
                "padding-right": "20px"
            });
            const canvasWrapper = $("<div>").addClass("col-6").css({
                "overflow-x": "auto",
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

            // Initialize DataTable
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

                const canvas = $("<canvas>").attr("id", canvasId);
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

            // Check if XLSX is loaded before adding event handlers
            const checkXLSXLoaded = () => {
                if (typeof XLSX !== 'undefined') {
                    setupExcelExport();
                } else {
                    // If XLSX is not loaded, dynamically load it
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    script.onload = setupExcelExport;
                    document.head.appendChild(script);
                }
            };

            // Check if html2pdf is loaded before adding event handlers
            const checkHTML2PDFLoaded = () => {
                if (typeof html2pdf !== 'undefined') {
                    setupPDFExport();
                } else {
                    // If html2pdf is not loaded, dynamically load it
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = setupPDFExport;
                    document.head.appendChild(script);
                }
            };

            // Setup Excel export functionality
            async function setupExcelExport() {
                excelOption.on("click", async function () {
                    try {
                        // Create a new ExcelJS Workbook
                        const workbook = new ExcelJS.Workbook();
                        const worksheet = workbook.addWorksheet("Data", {
                            views: [{ showGridLines: false }] // Remove gridlines
                        });

                        // Get table data from DataTable
                        const dataTable = $('#' + tableId).DataTable();

                        if (!dataTable || dataTable.rows().count() === 0) {
                            alert("No data available for export.");
                            return;
                        }

                        // Extract headers
                        const headers = dataTable.columns().header().toArray().map(header => $(header).text());
                        const headerRow = worksheet.addRow(headers);
                        headerRow.eachCell((cell) => {
                            cell.font = { bold: true };
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                            cell.border = {
                                top: { style: 'thin' },
                                left: { style: 'thin' },
                                bottom: { style: 'thin' },
                                right: { style: 'thin' },
                            };
                        });

                        // Extract data and add to worksheet
                        dataTable.rows().every(function () {
                            const rowData = this.data();
                            const dataRow = worksheet.addRow(rowData);

                            dataRow.eachCell((cell) => {
                                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                                cell.border = {
                                    top: { style: 'thin' },
                                    left: { style: 'thin' },
                                    bottom: { style: 'thin' },
                                    right: { style: 'thin' },
                                };
                            });
                        });

                        // Adjust column widths
                        worksheet.columns.forEach((column, index) => {
                            const maxWidth = Math.max(
                                headers[index].length,
                                ...dataTable
                                    .rows()
                                    .data()
                                    .toArray()
                                    .map(row => row[index] ? row[index].toString().length : 10)
                            );
                            column.width = Math.min(maxWidth + 2, 50);
                        });

                        // Ensure there's space for the chart
                        const chartStartRow = dataTable.rows().count() + 5;
                        worksheet.addRow([]);
                        worksheet.addRow(["Chart Visualization:"]);
                        worksheet.addRow([]);

                        // Embed the chart if it exists
                        if (chart) {
                            const chartImage = chart.toBase64Image();

                            if (!chartImage) {
                                throw new Error("Chart image could not be converted to Base64.");
                            }

                            const imageId = workbook.addImage({
                                base64: chartImage,
                                extension: 'png',
                            });

                            worksheet.addImage(imageId, {
                                tl: { col: 0, row: chartStartRow },
                                ext: { width: 600, height: 400 }, // Adjust as necessary
                            });
                        }

                        // Save workbook to buffer
                        const buffer = await workbook.xlsx.writeBuffer();
                        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

                        // Download the Excel file
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "data-with-chart.xlsx";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        dropdownContent.hide();
                    } catch (error) {
                        console.error("Excel export error:", error);
                        alert("Excel export failed. Please check the console for details.");
                    }
                });
            }



            // Setup PDF export functionality
            function setupPDFExport() {
                // PDF download handler
                pdfOption.on("click", function () {
                    try {
                        // Create a container for the content
                        const content = $("<div>").css({
                            "font-family": "Arial, sans-serif",
                            "padding": "20px"
                        });

                        // Add a title
                        content.append($("<h2>").text("Data Export").css({
                            "text-align": "center",
                            "margin-bottom": "20px"
                        }));

                        // Create a timestamp
                        const now = new Date();
                        const timestamp = now.toLocaleString();
                        content.append($("<p>").text("Generated: " + timestamp).css({
                            "text-align": "right",
                            "font-style": "italic",
                            "margin-bottom": "20px"
                        }));

                        // Get the data from the DataTable
                        const dataTable = $('#' + tableId).DataTable();
                        const tableData = [];

                        // Extract visible data from DataTable
                        dataTable.rows().every(function () {
                            tableData.push(this.data());
                        });

                        // Recreate the table
                        const pdfTable = $("<table>").css({
                            "width": "100%",
                            "border-collapse": "collapse",
                            "margin-bottom": "30px"
                        });

                        // Add headers
                        const pdfTableHead = $("<thead>");
                        const pdfTableHeaderRow = $("<tr>");
                        headers.forEach(header => {
                            pdfTableHeaderRow.append($("<th>").text(header).css({
                                "border": "1px solid #ddd",
                                "padding": "8px",
                                "background-color": "#f2f2f2",
                                "text-align": "left"
                            }));
                        });
                        pdfTableHead.append(pdfTableHeaderRow);
                        pdfTable.append(pdfTableHead);

                        // Add body rows
                        const pdfTableBody = $("<tbody>");
                        tableData.forEach(row => {
                            const tr = $("<tr>");
                            row.forEach(cell => {
                                tr.append($("<td>").text(cell || '').css({
                                    "border": "1px solid #ddd",
                                    "padding": "8px"
                                }));
                            });
                            pdfTableBody.append(tr);
                        });
                        pdfTable.append(pdfTableBody);

                        content.append(pdfTable);

                        // Add the chart if available
                        if (chart) {
                            content.append($("<h3>").text("Chart Visualization").css({
                                "margin-top": "20px",
                                "margin-bottom": "15px"
                            }));

                            // Get the chart as an image
                            const chartImage = chart.canvas.toDataURL('image/png');
                            const chartImg = $("<img>").attr({
                                "src": chartImage,
                                "alt": "Chart Visualization"
                            }).css({
                                "max-width": "100%",
                                "height": "auto",
                                "display": "block",
                                "margin": "0 auto"
                            });

                            content.append(chartImg);
                        }

                        // Generate PDF with html2pdf
                        const element = content[0];
                        const opt = {
                            margin: [10, 10],
                            filename: 'data-export.pdf',
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2 },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        };

                        // Use html2pdf to generate and download the PDF
                        html2pdf().set(opt).from(element).save();

                        // Hide dropdown after download
                        dropdownContent.hide();
                    } catch (error) {
                        console.error("PDF export error:", error);
                        alert("PDF export failed. Please make sure the html2pdf library is loaded properly.");
                    }
                });
            }

            
            // Print handler - doesn't require external libraries
            printOption.on("click", function () {
                try {
                    // Create printable content
                    const printWindow = window.open('', '_blank');

                    printWindow.document.write('<html><head><title>Print Data</title>');
                    printWindow.document.write('<style>');
                    printWindow.document.write('table { width: 100%; border-collapse: collapse; }');
                    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
                    printWindow.document.write('th { background-color: #f2f2f2; }');
                    printWindow.document.write('h2, h3 { text-align: center; }');
                    printWindow.document.write('.chart-container { text-align: center; margin: 20px 0; }');
                    printWindow.document.write('</style>');
                    printWindow.document.write('</head><body>');

                    // Add title
                    printWindow.document.write('<h2>Data Print</h2>');

                    // Get the data from the DataTable
                    const dataTable = $('#' + tableId).DataTable();
                    const tableData = [];

                    // Extract visible data from DataTable
                    dataTable.rows().every(function () {
                        tableData.push(this.data());
                    });

                    // Create table HTML
                    printWindow.document.write('<table>');
                    printWindow.document.write('<thead><tr>');
                    headers.forEach(header => {
                        printWindow.document.write('<th>' + header + '</th>');
                    });
                    printWindow.document.write('</tr></thead>');

                    printWindow.document.write('<tbody>');
                    tableData.forEach(row => {
                        printWindow.document.write('<tr>');
                        row.forEach(cell => {
                            printWindow.document.write('<td>' + (cell || '') + '</td>');
                        });
                        printWindow.document.write('</tr>');
                    });
                    printWindow.document.write('</tbody></table>');

                    // Add chart if available
                    if (chart) {
                        printWindow.document.write('<h3>Chart Visualization</h3>');
                        printWindow.document.write('<div class="chart-container">');
                        // Get the chart as an image
                        const chartImage = chart.canvas.toDataURL('image/png');
                        printWindow.document.write('<img src="' + chartImage + '" style="max-width: 100%;" />');
                        printWindow.document.write('</div>');
                    }

                    printWindow.document.write('</body></html>');
                    printWindow.document.close();

                    // Wait for content to load before printing
                    printWindow.onload = function () {
                        printWindow.print();
                        printWindow.close();
                    };

                    // Hide dropdown after initiating print
                    dropdownContent.hide();
                } catch (error) {
                    console.error("Print error:", error);
                    alert("Print failed. Please try again.");
                }
            });

            // Check for libraries and set up export handlers
            checkXLSXLoaded();
            checkHTML2PDFLoaded();

        } else {
            // Handle text or structured response (keep existing code)
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
            $(".input-container").css({ "flex-direction": "column" })
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
            url: "/get-response",
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
    // $(".attach-button").on("click", function (e) {
    //     e.preventDefault();
    //     e.stopPropagation();  // Prevent multiple triggers
    //     $("#file-input").click();
    // });

    // Clear file input when closing the file upload container
    $("#close-upload, #cancel-upload").on("click", function () {
        fileInput[0].value = '';
        $(".file-badges").remove();
    });

    // Handle file selection directly from paperclip icon
    $(".fa-paperclip").parent().on("click", function (e) {
        console.log("Paperclip parent clicked");
        e.preventDefault(); // Try adding this
        e.stopPropagation(); // Try adding this
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