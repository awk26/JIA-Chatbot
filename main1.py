import os
import uuid
from flask import Flask, request, jsonify, session, render_template, send_file, abort
from common.chat_history_manager import ChatHistoryManager
from common.document import get_folder_structure, build_qa_chain
from common.charts import charts
from common.database_query import database_query
import mimetypes
from pathlib import Path

# =============================
# Configuration & Global Setup
# =============================
CHAT_HISTORY_DIR = './chat_histories'
chat_history_manager = ChatHistoryManager(CHAT_HISTORY_DIR)

app = Flask(__name__)
app.secret_key = os.urandom(24)
POLICY_TYPE = None  # Global policy type (to be set via API)

# Define the base directory where your documents are stored
# You'll need to adjust this path to match your actual document structure
DOCUMENTS_BASE_DIR = './documents'  # Adjust this path as needed

# =============================
# Helper Functions
# =============================



# =============================
# API Routes
# =============================

@app.route('/')
def home():
    """Home route to render the main page."""
    categories = get_folder_structure()
    if 'conversation_id' not in session:
        session['conversation_id'] = f"chat-{uuid.uuid4()}"
    current_category = session.get('current_category', None)
    return render_template('index.html', categories=categories, current_category=current_category)

@app.route("/set-category", methods=["POST"])
def set_category():
    """Set the policy category for the session."""
    global POLICY_TYPE
    category = request.form.get('category')
   
    valid_categories = get_folder_structure().keys()
    if category not in valid_categories:
        return jsonify({"error": "Invalid category."}), 400

    POLICY_TYPE = category
    session['current_category'] = category
    return jsonify({"message": f"Policy category set to '{POLICY_TYPE}'"}), 200

@app.route("/get-response", methods=["POST"])
def get_response():
    """Process user query and return response."""
    global POLICY_TYPE
    if not POLICY_TYPE:
        return jsonify({"response": "Policy type not set. Use /set-category first."})

    conversation_id = session.get('conversation_id', f"chat-{uuid.uuid4()}")
    session['conversation_id'] = conversation_id
    current_category = session.get('current_category', None)
    
    query = request.form.get('message', '').strip()
    
    # Log query to file
    if query:
        with open('queries.txt', 'a') as f:
            # Count existing lines to determine the next number
            try:
                with open('queries.txt', 'r') as fr:
                    count = sum(1 for _ in fr)
            except FileNotFoundError:
                count = 0

            f.write(f"{count + 1}. {query}\n")
    
    if not query:
        return jsonify({"error": "Missing 'question' in request."}), 400
   
    # Get response from QA chain
    if POLICY_TYPE == "MIS":
        chart, chart_type = charts(query)
      
        qa_chain = build_qa_chain(POLICY_TYPE, query)
      
        timestamp = chat_history_manager.add_to_history(
            conversation_id,
            query,
            qa_chain,
            None,
            current_category if current_category else "multiple"
        )
        result = database_query(qa_chain, chart, chart_type, query)
      
        return result
    else:
        qa_chain = build_qa_chain(POLICY_TYPE, query)
        result = qa_chain({"query": query})

        answer = result["result"]
        sources = result.get("source_documents", [])
     
        # Extract source files with more detailed information
        source_files = []
        for doc in sources:
            source_path = doc.metadata.get("source", "Unknown")
            filename = os.path.basename(source_path)
            page_num = doc.metadata.get("page", None)
            
            source_info = {
                "document": filename,
                "category": POLICY_TYPE,
                "page": page_num
            }
            source_files.append(source_info)
        
        # Remove duplicates while preserving structure
        seen = set()
        unique_sources = []
        for source in source_files:
            key = (source["document"], source["category"])
            if key not in seen:
                seen.add(key)
                unique_sources.append(source)
        
        # Add to chat history
        timestamp = chat_history_manager.add_to_history(
            conversation_id,
            query,
            answer,
            [s["document"] for s in unique_sources],
            current_category if current_category else "multiple"
        )
        
        return jsonify({
            "response": answer,
            "suggestion": unique_sources if unique_sources else "No specific sources found for this query.",
            "timestamp": timestamp
        })



@app.route('/get-chat-history', methods=['GET'])
def get_chat_history():
    """Get chat history for the current conversation."""
    conversation_id = session.get('conversation_id')
    if not conversation_id:
        return jsonify({"status": "error", "message": "No active conversation"})
    
    chat_history = chat_history_manager.get_chat_history(conversation_id)
    return jsonify({"status": "success", "history": chat_history})

@app.route('/get-categories', methods=['GET'])
def get_categories():
    """Get available policy categories."""
    categories = get_folder_structure()
    return jsonify({
        "status": "success",
        "categories": categories
    })

# Add this new route to your main.py file

@app.route('/open-file', methods=['POST'])
def open_file():
    """Serve/open a file by name."""
    try:
        filename = request.form.get('filename')
        if not filename:
            return jsonify({"error": "Filename is required"}), 400

        # Normalize slashes
        filename = filename.replace('\\', '/')

        # Base files directory
        base_path = "/home/jia/JIA-Chatbot/files/"

        # Remove leading 'files/' if included in filename
        if filename.startswith("files/"):
            filename = filename[len("files/"):]

        # Build full path
        full_path = os.path.normpath(os.path.join(base_path, filename))

        # Security check: prevent path traversal
        if not full_path.startswith(os.path.abspath(base_path)):
            return jsonify({"error": "Invalid path access detected."}), 400

        # Try direct path first
        if os.path.exists(full_path):
            mimetype = mimetypes.guess_type(full_path)[0] or 'application/octet-stream'
            return send_file(
                full_path,
                mimetype=mimetype,
                as_attachment=False,
                download_name=os.path.basename(full_path)
            )

        # Try to search within category folders
        available_categories = get_folder_structure().keys()
        current_category = session.get('current_category', None) or POLICY_TYPE

        for category in available_categories:
            if category == current_category:
                continue  # already checked
            alt_path = os.path.normpath(os.path.join(base_path, category, filename))
            if os.path.exists(alt_path):
                mimetype = mimetypes.guess_type(alt_path)[0] or 'application/octet-stream'
                return send_file(
                    alt_path,
                    mimetype=mimetype,
                    as_attachment=False,
                    download_name=os.path.basename(alt_path)
                )

        return jsonify({"error": f"File '{filename}' not found in any category"}), 404

    except Exception as e:
        return jsonify({"error": f"Error opening file: {str(e)}"}), 500
# =============================
# Run the Flask App
# =============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)