import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader,UnstructuredPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from common.database import Database
from langchain.chains import LLMChain

# =============================
# Configuration
# =============================
os.environ["GOOGLE_API_KEY"] = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your real key
embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1)

# =============================
# Document Processing Functions
# =============================

def get_folder_structure():
    """Returns a user-friendly representation of the folder structure."""
    return {
        "IT Policy": "IT Policy",
        "HR Policy": "HR Policy",
        "SOPP_Operation": "SOPP_Operation",
        "SOPP_Procurement": "SOPP_Procurement",
        "SOPP_Revenue": "SOPP_Revenue",
        "SOPP_Sales": "SOPP_Sales",
        "MIS": "MIS"
    }

def load_vectorstore(policy_type):
    try:
        """Load or create vectorstore for the given policy type."""
        # Map policy_type to actual folder path
        folder_map = {
            "IT Policy": "IT Policy",
            "HR Policy": "HR Policy",
            "SOPP_Operation": "SOP/Operation",
            "SOPP_Procurement": "SOP/Procurement",
            "SOPP_Revenue": "SOP/Revenue",
            "SOPP_Sales": "SOP/Sales"
        }

        folder_name = folder_map.get(policy_type)
        if not folder_name:
            raise ValueError(f"Invalid policy type: {policy_type}")

        base_folder = f"files/{folder_name}"
        vectordb_path = f"chroma/{policy_type.lower().replace(' ', '_').replace('-', '_')}"

        if os.path.exists(vectordb_path):
            vectorstore = Chroma(persist_directory=vectordb_path, embedding_function=embedding)
        else:
            print("vector===========================")
            loader = DirectoryLoader(path=base_folder, glob="*.pdf", loader_cls=PyPDFLoader)
            docs = loader.load()
            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            documents = splitter.split_documents(docs)
            vectorstore = Chroma.from_documents(documents, embedding, persist_directory=vectordb_path)
            vectorstore.persist()

        return vectorstore
    except Exception as e:
        print(f"Error in load_vectorstore:{e}")

def build_qa_chain(policy_type,query):
    """Build QA chain for the given policy type."""
    if policy_type=="MIS":
        prompt_template = """
            You are a helpful assistant that generates SQL queries based on user questions.

            Use only this SQL view: [MIS].[PERIODIC_REPORT]

            The view contains the following columns:
            MONTHS, ENTITY_CODE, ENTITY_NAME, OKR, SHORT_NAME, LONG_NAME,
            DATE_ACTUALS, WTD_ACTUALS, FTD_ACTUALS, MTD_ACTUALS, QTD_ACTUALS,
            HTD_ACTUALS, YTD_ACTUALS, DATE_BUDGET, WTD_BUDGET, FTD_BUDGET,
            MTD_BUDGET, QTD_BUDGET, HTD_BUDGET, YTD_BUDGET, GROUP_ENTITY

            Instructions:
            - Generate only a valid SQL SELECT query.
            - Use a WHERE clause if any filters are mentioned (e.g., ENTITY_NAME, DATE range).
            - Use proper SQL syntax compatible with Microsoft SQL Server.
            - Use aliases for all aggregate functions (e.g., COUNT(*) AS count).
            - Use aliases if it improves clarity of the result set.
            - If date-based filters (e.g., "last 3 months") are mentioned, use SQL Server date functions like DATEADD and GETDATE.
            - Return only the SQL query without explanation or formatting.
            - Do not wrap the query in code blocks or markdown formatting.

            User Request:
            {user_input}

            SQL Query:
            """

        prompt = PromptTemplate(
            input_variables=["user_input"],
            template=prompt_template,
        )

        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")  # Use appropriate Gemini setup

        chain = LLMChain(llm=llm, prompt=prompt)

        # Example call
        # user_query = "Get ENTITY_NAME, MTD_ACTUALS, and QTD_ACTUALS for April 2024"
        result = chain.run(user_input=query)
      
        clean_sql = result.strip("`").split("sql\n")[-1].rsplit("```", 1)[0].strip()
    
        db=Database()
        data=db.execute(clean_sql)
      
        return data
    else:
       
        retriever = load_vectorstore(policy_type).as_retriever()
        custom_prompt = PromptTemplate(
            input_variables=["context", "question"],
            template="""
            You are a helpful assistant for answering {policy_type}-related questions.
            Use ONLY the information provided in the context below to answer the question.
            If the answer is not present in the context, reply with "I'm sorry, but I don't have an answer to that".

            Context:
            {context}

            Question:
            {question}

            Answer:""".strip()
                )
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")  # Use appropriate Gemini setup

        chain = LLMChain(llm=llm, prompt=custom_prompt)
        return RetrievalQA.from_chain_type(
            llm=llm,
            retriever=retriever,
            chain_type="stuff",
            chain_type_kwargs={"prompt": custom_prompt.partial(policy_type=policy_type)},
            return_source_documents=True
        )