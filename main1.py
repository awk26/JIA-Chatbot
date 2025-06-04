import os
import uuid
from flask import Flask, request, jsonify, session, render_template, send_file, abort
from common.chat_history_manager import ChatHistoryManager
from common.document1 import get_folder_structure, build_qa_chain,get_policy_names,get_policy_count
from common.charts import charts
from common.database_query import database_query
import mimetypes
from common.logs import log
from pathlib import Path
from datetime import datetime
# =============================
# Configuration & Global Setup
# =============================
CHAT_HISTORY_DIR = './chat_histories'
chat_history_manager = ChatHistoryManager(CHAT_HISTORY_DIR)

app = Flask(__name__)
app.secret_key = os.urandom(24)
POLICY_TYPE = None  # Global policy type (to be set via API)
POLICY_COUNT=None
POLICY_NAMES=None



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
    try:
        """Set the policy category for the session."""
        global POLICY_TYPE,POLICY_COUNT,POLICY_NAMES
        category = request.form.get('category')
        valid_categories = get_folder_structure().keys()

        if category not in valid_categories:
            return jsonify({"error": "Invalid category."}), 400

        POLICY_TYPE = category
        POLICY_COUNT=get_policy_count(POLICY_TYPE)
        POLICY_NAMES=get_policy_names(POLICY_TYPE)
        session['current_category'] = category
        log(f"Policy category set to '{POLICY_TYPE}'")
        return jsonify({"message": f"Policy category set to '{POLICY_TYPE}'"}), 200
    except Exception as e:
        log(f"Exception occurred in set-category api:{e}")
        return jsonify({"error": f"Error setting category: {str(e)}"}), 500


@app.route("/get-response", methods=["POST"])
def get_response():
    """Process user query and return response."""
    try:
        global POLICY_TYPE,POLICY_NAMES,POLICY_COUNT
        if not POLICY_TYPE:
            return jsonify({"response": "Policy type not set. Use /set-category first."})
        
        conversation_id = session.get('conversation_id', f"chat-{uuid.uuid4()}")
        session['conversation_id'] = conversation_id
        current_category = session.get('current_category', None)       
        query = request.form.get('message', '').strip()
        log(f"User Query:{query}")       
        
        if query:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            try:
                with open('queries.txt', 'r') as fr:
                    count = sum(1 for _ in fr)
            except FileNotFoundError:
                count = 0
            with open('queries.txt', 'a') as f:
                f.write(f"{count + 1}. [{timestamp}]: {query}\n")
        
        if not query:
            return jsonify({"error": "Missing 'question' in request."}), 400
        
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
            chat_history_raw = chat_history_manager.get_chat_history(conversation_id)
            qa_chain = build_qa_chain(POLICY_TYPE, query, POLICY_NAMES=POLICY_NAMES, POLICY_COUNT=POLICY_COUNT, chat_history=chat_history_raw)         
            result = qa_chain.invoke({"question": query})
            answer = result.get("answer", result.get("result", "I'm sorry, no answer was generated."))

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
                
    except Exception as e:
        log(f"Exception occurred in get-response api:{e}")
        return jsonify({
            "error": f"An error occurred while processing your request: {str(e)}"
        }), 500


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
        current_category = session.get('current_category', None) or POLICY_TYPE
    
        filename = request.form.get('filename')
        if not filename:
            return jsonify({"error": "Filename is required"}), 400

        # Normalize slashes
        filename = filename.replace('\\', '/')
        
        # Base files directory
        base_path = "/home/jia/JIA-Chatbot/files"
        if current_category=="SOPP_Procurement":
            base_path="/home/jia/JIA-Chatbot/files/SOP/Procurement/"
        elif current_category=="SOPP_Revenue":
            base_path="/home/jia/JIA-Chatbot/files/SOP/Revenue/"
        elif current_category=="SOPP_Sales":
            base_path="/home/jia/JIA-Chatbot/files/SOP/Sales/"    
          

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