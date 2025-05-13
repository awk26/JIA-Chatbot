from flask import Flask, request, jsonify, render_template
import os
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.embeddings import HuggingFaceEmbeddings
import glob
load_dotenv()

app = Flask(__name__)

# Configuration
DOCS_DIR = './files'  # Directory where document files are stored
CHROMA_DIR = './chroma_db'  # Directory to store the vector database
os.makedirs(DOCS_DIR, exist_ok=True)
os.makedirs(CHROMA_DIR, exist_ok=True)

# Set up Gemini API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEYS")  # Replace with your actual API key
genai.configure(api_key=GOOGLE_API_KEY)

# Global variables
vector_store = None
processed_files = []

def init_documents():
    """Process all PDFs and Word documents into a single vector store."""
    global vector_store, processed_files
    
    # Get both PDF and Word files
    pdf_files = glob.glob(os.path.join(DOCS_DIR, "*.pdf"))
    word_files = glob.glob(os.path.join(DOCS_DIR, "*.docx"))
    all_files = pdf_files + word_files
    
    print(f"Found {len(pdf_files)} PDF files and {len(word_files)} Word files in {DOCS_DIR}")
    
    all_chunks = []
    processed_files = []
    
    for file_path in all_files:
        file_name = os.path.basename(file_path)
        file_ext = os.path.splitext(file_path)[1].lower()
        
        try:
            # Choose the appropriate loader based on file extension
            if file_ext == '.pdf':
                loader = PyPDFLoader(file_path)
            elif file_ext == '.docx':
                loader = Docx2txtLoader(file_path)
            else:
                print(f"Unsupported file format: {file_name}")
                continue
            
            # Load the document
            documents = loader.load()
            
            # Add the filename to each document's metadata
            for doc in documents:
                doc.metadata["source"] = file_name
            
            # Split the document into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200,
                length_function=len
            )
            chunks = text_splitter.split_documents(documents)
            
            all_chunks.extend(chunks)
            processed_files.append(file_name)
            print(f"Successfully processed: {file_name} ({len(chunks)} chunks)")
        except Exception as e:
            print(f"Error processing {file_name}: {str(e)}")
    
    # Create embeddings for all documents
    if all_chunks:
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # Create a unified vector store with all documents
        vector_store = Chroma.from_documents(
            documents=all_chunks,
            embedding=embeddings,
            persist_directory=CHROMA_DIR
        )
        vector_store.persist()
        
        print(f"Created vector store with {len(all_chunks)} chunks from {len(processed_files)} documents")
    else:
        print("No documents were successfully processed")

@app.route('/')
def home():
    return render_template('index1.html')

@app.route('/get-response', methods=['POST'])
def get_response():
    """The only API endpoint - answers questions based on all documents."""
    global vector_store
    
    # Check if vector store is ready
    if vector_store is None:
        return jsonify({"error": "Documents are still being processed. Please try again later."}), 503
    
    question = request.form.get('message', '').strip()
    print(question)
    if not question:
        return jsonify({"error": "Please provide a question"}), 400
    
    print(f"Received question: {question}")
    
    try:
        # Set up the LLM
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.2,
            google_api_key=GOOGLE_API_KEY
        )
        
        # Create retriever
        retriever = vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 5}
        )
        
        # Create QA chain
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=retriever,
            return_source_documents=True
        )
        
        # Get the answer
        result = qa_chain.invoke({"query": question})
        
        # Format sources
        sources = []
        for doc in result.get("source_documents", []):
            source_info = {
                "document": doc.metadata.get("source", "Unknown"),
                "page": doc.metadata.get("page", 0) + 1
            }
            sources.append(source_info)
        
        # Return the answer and sources
        return jsonify({
            "response": result["result"],
            "suggestion": sources
        })
        
    except Exception as e:
        import traceback
        print(f"Error processing question: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Initialize documents on startup
    print("Starting document processing...")
    init_documents()
    
    print("\nStarting server...")
    print("Server running at http://0.0.0.0:5000")
    
    app.run(host="0.0.0.0", port=5000)