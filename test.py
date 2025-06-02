import os
import fitz  # PyMuPDF
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.vectorstores import FAISS
from langchain.text_splitter import CharacterTextSplitter
from langchain.schema import Document
from langchain.chains.retrieval_qa.base import RetrievalQA
from langchain.embeddings.base import Embeddings
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# --- CONFIG ---
GENAI_API_KEY = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your key
DOC_FOLDER = "files/SOP/Sales"
MAX_CHARS_PER_DOC = 15000

# --- PDF Text Extraction ---
def extract_text_from_pdf(path):
    doc = fitz.open(path)
    return " ".join([page.get_text() for page in doc])

# --- Prepare LangChain Components ---
os.environ["GOOGLE_API_KEY"] = GENAI_API_KEY

embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")

# Load documents
docs = []
for filename in os.listdir(DOC_FOLDER):
    if filename.endswith(".pdf"):
        file_path = os.path.join(DOC_FOLDER, filename)
        text = extract_text_from_pdf(file_path)[:MAX_CHARS_PER_DOC]
        docs.append(Document(page_content=text, metadata={"source": filename}))

# Split text into smaller chunks
text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
split_docs = text_splitter.split_documents(docs)

# Create vectorstore
vectorstore = FAISS.from_documents(split_docs, embedding)
retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 3})

# Gemini LLM
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

# Prompt Template (Optional)
custom_prompt = PromptTemplate.from_template(
    """You are a helpful assistant. Use the context below to answer the question at the end.

Context:
{context}

Question: {question}

Only use the given context to answer. Do not make up any information.

Answer:"""
)

# Create RetrievalQA chain
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=retriever,
    chain_type="stuff",
    chain_type_kwargs={"prompt": custom_prompt},
    return_source_documents=True
)

# --- Q&A Loop ---
print("🤖 Gemini + LangChain PDF Q&A bot is ready.")
while True:
    query = input("\nAsk your question (or type 'exit'): ")
    if query.lower() in ["exit", "quit"]:
        print("Goodbye!")
        break

    result = qa_chain(query)
    answer = result['result']
    sources = [doc.metadata['source'] for doc in result['source_documents']]

    print(f"\n📄 Sources used: {', '.join(set(sources))}")
    print(f"🤖 Answer:\n{answer}")
