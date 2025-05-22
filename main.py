import os
from flask import Flask, request, jsonify, session, render_template
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
import uuid
from common.chat_history_manager import ChatHistoryManager

# =============================
# Configuration & Global Setup
# =============================
CHAT_HISTORY_DIR = './chat_histories'
os.environ["GOOGLE_API_KEY"] = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your real key
embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)
chat_history_manager = ChatHistoryManager(CHAT_HISTORY_DIR)

app = Flask(__name__)
app.secret_key = os.urandom(24)
POLICY_TYPE = None  # Global policy type (to be set via API)

# =============================
# Helper Functions
# =============================

def get_folder_structure():
    """Returns a user-friendly representation of the folder structure."""
    return {
        "IT Policy": "IT Policy",
        "HR Policy": "HR Policy",
        "SOPP_Operation": "SOPP_Operation",
        "SOPP_Procurement":"SOPP_Procurement",
        "SOPP_Revenue":"SOPP_Revenue",
        "SOPP_Sales":"SOPP_Sales"

    }

def load_vectorstore(policy_type):
    # Map policy_type to actual folder path
    folder_map = {
        "IT Policy": "IT_Policy",
        "HR Policy": "HR_Policy",
        "SOPP_Operation": "SOP/Operation",
        "SOPP_Procurement":"SOP/Procurement",
        "SOPP_Revenue":"SOP/Revenue",
        "SOPP_Sales":"SOP/Sales"
    }

    folder_name = folder_map.get(policy_type)
    if not folder_name:
        raise ValueError(f"Invalid policy type: {policy_type}")

    base_folder = f"files/{folder_name}"
    vectordb_path = f"chroma/{policy_type.lower().replace(' ', '_').replace('-', '_')}"

    if os.path.exists(vectordb_path):
        vectorstore = Chroma(persist_directory=vectordb_path, embedding_function=embedding)
    else:
        loader = DirectoryLoader(path=base_folder, glob="*.pdf", loader_cls=PyPDFLoader)
        docs = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        documents = splitter.split_documents(docs)
        vectorstore = Chroma.from_documents(documents, embedding, persist_directory=vectordb_path)
        vectorstore.persist()

    return vectorstore

def build_qa_chain(policy_type):
    retriever = load_vectorstore(policy_type).as_retriever()
    custom_prompt = PromptTemplate(
        input_variables=["context", "question"],
        template="""
You are a helpful assistant for answering {policy_type}-related questions.
Use ONLY the information provided in the context below to answer the question.
If the answer is not present in the context, reply with "I don't know".

Context:
{context}

Question:
{question}

Answer:""".strip()
    )
    return RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff",
        chain_type_kwargs={"prompt": custom_prompt.partial(policy_type=policy_type)},
        return_source_documents=True
    )

# =============================
# API Routes
# =============================
@app.route('/')
def home():
    categories = get_folder_structure()
    if 'conversation_id' not in session:
        session['conversation_id'] = f"chat-{uuid.uuid4()}"
    current_category = session.get('current_category', None)
    return render_template('index.html', categories=categories, current_category=current_category)

@app.route("/set-category", methods=["POST"])
def set_category():
    global POLICY_TYPE
    category = request.form.get('category')
    print("==================", category)

    valid_categories = get_folder_structure().keys()
    if category not in valid_categories:
        return jsonify({"error": "Invalid category."}), 400

    POLICY_TYPE = category
    session['current_category'] = category
    return jsonify({"message": f"Policy category set to '{POLICY_TYPE}'"}), 200

@app.route("/get-response", methods=["POST"])
def get_response():
    global POLICY_TYPE
    if not POLICY_TYPE:
        
        return jsonify({"response": "Policy type not set. Use /set-category first."})

    conversation_id = session.get('conversation_id', f"chat-{uuid.uuid4()}")
    session['conversation_id'] = conversation_id
    current_category = session.get('current_category', None)

    query = request.form.get('message', '').strip()
    if not query:
        return jsonify({"error": "Missing 'question' in request."}), 400
  
    qa_chain = build_qa_chain(POLICY_TYPE)
    result = qa_chain({"query": query})

    answer = result["result"]
    sources = result.get("source_documents", [])

    source_files = [
        os.path.basename(doc.metadata.get("source", "Unknown"))
        for doc in sources
    ]
    source_files=list(set(source_files))
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
    conversation_id = session.get('conversation_id')
    if not conversation_id:
        return jsonify({"status": "error", "message": "No active conversation"})
    chat_history = chat_history_manager.get_chat_history(conversation_id)
    return jsonify({"status": "success", "history": chat_history})

@app.route('/get-categories', methods=['GET'])
def get_categories():
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
