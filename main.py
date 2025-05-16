from flask import Flask, request, jsonify, render_template, session
import os
import uuid
from dotenv import load_dotenv
from langchain.chains.retrieval_qa.base import RetrievalQA
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI
from common.document_processor import DocumentProcessor
from common.chat_history_manager import ChatHistoryManager

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.urandom(24)  # Secret key for session management

# Configuration
BASE_DIR = './files'
CHROMA_DIR = './chroma_db'
CHAT_HISTORY_DIR = './chat_histories'

# Set up Gemini API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEYS")
genai.configure(api_key=GOOGLE_API_KEY)

# Initialize document processor and chat history manager
document_processor = DocumentProcessor(BASE_DIR, CHROMA_DIR)
chat_history_manager = ChatHistoryManager(CHAT_HISTORY_DIR)

@app.route('/')
def home():
    """Render the home page with menu options."""
    # Get folder structure for menu
    categories = document_processor.get_folder_structure()
    
    # Generate a new conversation ID if not exists
    if 'conversation_id' not in session:
        session['conversation_id'] = f"chat-{uuid.uuid4()}"
    
    # Check if the session has a current category selected
    current_category = session.get('current_category', None)
    
    return render_template('index.html', 
                          categories=categories,
                          current_category=current_category)

@app.route('/set-category', methods=['POST'])
def set_category():
    """Set the current category for the chat session."""
    category = request.form.get('category')
    print("3333333333333333333333",category)
    # Store the selected category in the session
    session['current_category'] = category
    
    vector_stores = document_processor.get_vector_store()
    
    # Check if it's a valid category or "all"
    if category in vector_stores or category == "all":
        return jsonify({"status": "success", "category": category})
    else:
        return jsonify({"status": "error", "message": "Invalid category"})

@app.route('/get-response', methods=['POST'])
def get_response():
    """API endpoint - answers questions based on documents with improved user interaction."""
    # Get conversation ID from session or create new one
    conversation_id = session.get('conversation_id', f"chat-{uuid.uuid4()}")
    session['conversation_id'] = conversation_id
    
    # Get the currently selected category
    current_category = session.get('current_category', None)
    print("9999999999999999999",current_category)
    # Get message and handle special commands
    message = request.form.get('message', '').strip()
    print("==========================",message)
    # Handle special back to menu command
    if message.lower() in ["back to menu", "menu", "back", "main menu"]:
        # Clear the current category
        session.pop('current_category', None)
        return jsonify({
            "response": "I've returned to the main menu. What would you like to know about?",
            "suggestion": "Please select a category or ask a question.",
            "show_menu": True
        })
    
    # Handle listing files command
    if message.lower() in ["list files", "show files", "what files do you have", "what documents are available"]:
        all_docs = document_processor.get_all_document_names()
        if all_docs:
            response = "Here are all the available documents:\n\n"
            by_category = {}
            
            for doc in all_docs:
                cat = doc["category"]
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(doc["filename"])
            
            for cat, files in by_category.items():
                response += f"**{cat.replace('_', ' ')}**:\n"
                for idx, file in enumerate(files, 1):
                    response += f"{idx}. {file}\n"
                response += "\n"
            
            return jsonify({
                "response": response,
                "suggestion": "You can ask questions about any of these documents."
            })
        else:
            return jsonify({
                "response": "No documents have been processed yet.",
                "suggestion": "Please upload some documents to the system."
            })
    
    # Check if we have any vector stores
    if not document_processor.has_documents():
        return jsonify({
            "response": "I'm still processing the documents. Please try again in a moment.",
            "suggestion": "You can try asking about our available categories in the meantime."
        })
    
    if not message:
        return jsonify({
            "response": "Please provide a question for me to answer based on your documents.",
            "suggestion": "You can ask about specific content in your uploaded files."
        })
    
    try:
        # Set up the LLM
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.2,
            google_api_key=GOOGLE_API_KEY
        )
        
        # Get vector stores from document processor
        vector_stores = document_processor.get_vector_store()
        print("666666666666666666",vector_stores)
        # Determine which vector store(s) to use based on current_category
        retrievers = []
        
        if current_category and current_category != "all" and current_category in vector_stores:
            print("tttttttttttttttttttttttttttttttttt")
            # Use the specific category selected by the user
            retriever = vector_stores[current_category].as_retriever(
                search_type="similarity",
                search_kwargs={"k": 7}
            )
            retrievers.append((current_category, retriever))
        else:
            print("eeeeeeeeeeeeeeeeeeeeeeee")
            # If no category is selected or "all" is selected, try to detect the appropriate one
            category_keywords = document_processor.get_category_keywords()
            
            # Check message for category keywords
            message_lower = message.lower()
            matched_categories = []
            
            for cat, keywords in category_keywords.items():
                if any(keyword in message_lower for keyword in keywords):
                    matched_categories.append(cat)
            
            # If no match, use all available categories
            if not matched_categories:
                matched_categories = list(vector_stores.keys())
            
            # Add retrievers for matched categories
            for cat in matched_categories:
                if cat in vector_stores:
                    print("dddddddddddddddddddddddddd")
                    retriever = vector_stores[cat].as_retriever(
                search_type="similarity",  # Use score threshold to ensure quality
                search_kwargs={
                    "k": 5,  # Increased from 7 to 10 for better coverage
                     # Lower threshold to capture more potentially relevant docs
                }
            )
                    retrievers.append((cat, retriever))
        
        results = []
        sources = []
        print("cczzzzzzzzzzzzzzzzzzzzzzzzz",retrievers)
        # Query each retriever
        formatted_text=None
        for category, retriever in retrievers:
            
            print("qqqqqqqqqqqqqqq",category,current_category)
            if not category[:4]=="SOPP":
                formatted_text = category.replace("_", " ")
            if formatted_text==current_category or category==current_category:
                print("category---------------",category)
                print("retriever-----------------",retriever)
                # Create QA chain with enhanced prompting
                qa_chain = RetrievalQA.from_chain_type(
                    llm=llm,
                    chain_type="stuff",
                    retriever=retriever,
                    return_source_documents=True
                )
                
                # Format category name for display
                display_category = category.replace('_', ' ')
                print("77777777777777777777",display_category)
                # Enhanced prompt for better context awareness
                prompt = f"""
                You are JIA (JMB Intelligent Assistant), a helpful AI assistant providing answers based on JMB company documents.
                
                Current category: {display_category}
                
                Answer the question based ONLY on the provided context. If you don't know the answer or cannot find it in the context, 
                say "I don't have enough information to answer this question based on the available documents" and suggest how the user 
                might rephrase their question.
                
                Question: {message}
                """
                
                # Get the answer from this category
                result = qa_chain.invoke({"query": prompt})
                answer = result["result"].strip()
                print("resul-------------------------",result)
                print("answer--------------------------",answer)
                # Add to results if the answer is meaningful
                if "don't have enough information" not in answer:
                    results.append(answer)
                    
                    # Format sources from this category
                    for doc in result.get("source_documents", []):
                        source_info = {
                            "category": display_category,
                            "document": doc.metadata.get("source", "Unknown"),
                            "page": doc.metadata.get("page", 0) + 1
                        }
                        if source_info not in sources:  # Avoid duplicate sources
                            sources.append(source_info)
        
        # Combine answers
        if results:
            print("=====================22222222222222222222")
            # Format the best answer
            if len(results) == 1:
                print("ssssssssssssssssssssssssss")
                final_answer = results[0]
            else:
                print("llllllllllllllllllllllllll")
                # If multiple categories had answers, combine them intelligently
                final_answer = "Based on the information I found:\n\n" + "\n\n".join(results)
            
            # Add the exchange to chat history using the manager
            timestamp = chat_history_manager.add_to_history(
                conversation_id,
                message,
                final_answer,
                sources,
                current_category if current_category else "multiple"
            )
            
            # Return the answer and sources
            return jsonify({
                "response": final_answer,
                "suggestion": sources if sources else "No specific sources found for this query.",
                "timestamp": timestamp
            })
        else:
            return jsonify({
                "response": "I couldn't find relevant information about this in our documents. Could you rephrase your question or select a specific category from the menu?",
                "suggestion": [
                    {"tip": "Try using keywords that might appear in our documents"},
                    {"tip": "You can view available documents by typing 'list files'"}
                ]
            })
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error processing question: {str(e)}")
        print(error_trace)
        
        return jsonify({
            "response": "I encountered an error while processing your question. Could you try rephrasing it or providing more context?",
            "suggestion": [
                {"tip": "Try to be more specific in your question"},
                {"tip": "You can try selecting a different category from the menu"}
            ]
        })

@app.route('/list-documents', methods=['GET'])
def list_documents():
    """Returns a list of processed documents."""
    # Get the currently selected category
    current_category = session.get('current_category', None)
    
    if current_category and current_category != "all":
        # Get documents only for the selected category
        processed_files = document_processor.get_processed_files()
        if current_category in processed_files:
            docs = [{"category": current_category, "filename": file} for file in processed_files[current_category]]
            return jsonify({
                "status": "success",
                "category": current_category,
                "documents": docs
            })
        else:
            return jsonify({
                "status": "error",
                "message": f"No documents found for category: {current_category}"
            })
    else:
        # Get all documents
        all_docs = document_processor.get_all_document_names()
        
        if not all_docs:
            return jsonify({
                "status": "No documents processed",
                "documents": []
            })
        
        return jsonify({
            "status": "success",
            "documents": all_docs
        })

@app.route('/get-chat-history', methods=['GET'])
def get_chat_history():
    """Returns the chat history for the current session."""
    conversation_id = session.get('conversation_id')
    if not conversation_id:
        return jsonify({"status": "error", "message": "No active conversation"})
    
    chat_history = chat_history_manager.get_chat_history(conversation_id)
    return jsonify({"status": "success", "history": chat_history})

@app.route('/get-categories', methods=['GET'])
def get_categories():
    """Returns available categories based on processed documents."""
    categories = document_processor.get_folder_structure()
    return jsonify({
        "status": "success",
        "categories": categories
    })

if __name__ == '__main__':
    # First try to reload existing vector stores
    print("Trying to reload existing vector stores...")
    success = document_processor.reload_vector_stores()
    
    if not success:
        # If no existing vector stores, initialize new ones
        print("No existing vector stores found. Starting document processing...")
        success = document_processor.init_documents()
    
    print("\nStarting server...")
    print("Server running at http://0.0.0.0:5000")
    
    if not success:
        print("\nWARNING: No documents were processed. The system will not be able to answer questions until documents are added.")
    
    app.run(host="0.0.0.0", port=5000)