import os
import uuid
from flask import Flask, request, jsonify, session, render_template
from common.chat_history_manager import ChatHistoryManager
from common.document import get_folder_structure, build_qa_chain
from common.charts import charts
from common.database_query import database_query
# =============================
# Configuration & Global Setup
# =============================
CHAT_HISTORY_DIR = './chat_histories'
chat_history_manager = ChatHistoryManager(CHAT_HISTORY_DIR)

app = Flask(__name__)
app.secret_key = os.urandom(24)
POLICY_TYPE = None  # Global policy type (to be set via API)

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
    if POLICY_TYPE =="Test_DB":
        chart, chart_type = charts(query)
        print(chart, chart_type)
        qa_chain = build_qa_chain(POLICY_TYPE,query)
        print(qa_chain)
        timestamp = chat_history_manager.add_to_history(
            conversation_id,
            query,
            qa_chain,
            None,
            current_category if current_category else "multiple"
        )
        result=database_query(qa_chain,chart,chart_type,query)
        print(result)
        return result
    else:
        qa_chain = build_qa_chain(POLICY_TYPE,query)
        result = qa_chain({"query": query})

        answer = result["result"]
        sources = result.get("source_documents", [])
     
        # Extract source files
        source_files = [
            os.path.basename(doc.metadata.get("source", "Unknown"))
            for doc in sources
        ]
        source_files = list(set(source_files))
        
        # Add to chat history
        timestamp = chat_history_manager.add_to_history(
            conversation_id,
            query,
            answer,
            source_files,
            current_category if current_category else "multiple"
        )
        
        return jsonify({
            "response": answer,
            "suggestion": source_files if source_files else "No specific sources found for this query.",
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

# =============================
# Run the Flask App
# =============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)