import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA

# 1. Set your Gemini API Key (Optional: if not set as env variable)

os.environ["GOOGLE_API_KEY"] = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your actual key

# 2. Load PDF documents
loader = DirectoryLoader(path='files/HR Policy', glob="*.pdf", loader_cls=PyPDFLoader)
docs = loader.load()

# 3. Split documents into chunks
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
documents = splitter.split_documents(docs)

# 4. Create or load vectorstore with embeddings
embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
vectordb_path = "chroma/hr_policy"

if os.path.exists(vectordb_path):
    vectorstore = Chroma(persist_directory=vectordb_path, embedding_function=embedding)
else:
    vectorstore = Chroma.from_documents(documents, embedding, persist_directory=vectordb_path)
    vectorstore.persist()

# 5. Set up retriever
retriever = vectorstore.as_retriever()

# 6. Set up Gemini Q&A chain
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)
qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever, chain_type="stuff")

# 7. Ask questions in a loop
print("✅ Gemini Q&A Chatbot Ready! Ask your HR questions (type 'exit' to quit):")
while True:
    query = input("\nYou: ")
    if query.lower() in ['exit', 'quit']:
        print("👋 Exiting chatbot. Goodbye!")
        break

    response = qa_chain.run(query)
    print(f"🤖 Gemini: {response}")
