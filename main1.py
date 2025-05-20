import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA

# 0. GLOBAL: Set the policy type to either "HR Policy" or "IT Policy"
POLICY_TYPE = "IT Policy"  # Change to "IT Policy" to switch

# 1. Set Gemini API Key (Optional if already set in environment)
os.environ["GOOGLE_API_KEY"] = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your actual key

# 2. Define folder and vector store paths based on POLICY_TYPE
base_folder = f"files/{POLICY_TYPE}"
vectordb_path = f"chroma/{POLICY_TYPE.lower().replace(' ', '_')}"

# 3. Load PDF documents from selected policy directory
loader = DirectoryLoader(path=base_folder, glob="*.pdf", loader_cls=PyPDFLoader)
docs = loader.load()

# 4. Split documents into manageable chunks
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
documents = splitter.split_documents(docs)

# 5. Create or load the vector store using Google embeddings
embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")

if os.path.exists(vectordb_path):
    vectorstore = Chroma(persist_directory=vectordb_path, embedding_function=embedding)
else:
    vectorstore = Chroma.from_documents(documents, embedding, persist_directory=vectordb_path)
    vectorstore.persist()

# 6. Set up the retriever
retriever = vectorstore.as_retriever()

# 7. Define custom prompt to force LLM to use only provided context
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

# 8. Set up Gemini-based QA chain with the custom prompt
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=retriever,
    chain_type="stuff",
    chain_type_kwargs={"prompt": custom_prompt.partial(policy_type=POLICY_TYPE)},
    return_source_documents=True
)

# 9. Start the chatbot loop
print(f"✅ Gemini Q&A Chatbot Ready for {POLICY_TYPE}! Ask your questions (type 'exit' to quit):")
while True:
    query = input("\nYou: ")
    if query.lower() in ['exit', 'quit']:
        print("👋 Exiting chatbot. Goodbye!")
        break

    result = qa_chain({"query": query})
    answer = result["result"]
    sources = result.get("source_documents", [])

    print(f"\n🤖 Gemini: {answer}")

    if sources:
        print("\n📄 Source Documents Used:")
        for i, doc in enumerate(sources, 1):
            source_file = os.path.basename(doc.metadata.get('source', 'Unknown'))
            print(f"{i}. {source_file}")
    else:
        print("⚠️ No source documents used.")
