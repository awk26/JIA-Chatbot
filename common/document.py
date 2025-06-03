import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader,UnstructuredPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from common.database import Database
from langchain.chains import LLMChain
import datetime
# =============================
# Configuration
# =============================
os.environ["GOOGLE_API_KEY"] = "AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM"  # Replace with your real key
embedding = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.1)

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
        current_datetime=datetime.datetime.now()
        prompt_template = """
You are a helpful assistant that generates SQL queries based on user questions.

Use only this SQL view: [MIS].[PERIODIC_REPORT]

The view contains the following columns:
MONTHS, ENTITY_CODE, ENTITY_NAME, OKR, SHORT_NAME, LONG_NAME,
DATE_ACTUALS, WTD_ACTUALS, FTD_ACTUALS, MTD_ACTUALS, QTD_ACTUALS,
HTD_ACTUALS, YTD_ACTUALS, DATE_BUDGET, WTD_BUDGET, FTD_BUDGET,
MTD_BUDGET, QTD_BUDGET, HTD_BUDGET, YTD_BUDGET, GROUP_ENTITY

OKRs include:
VOLUME_TEU, VOLUME_TON, EBITDA, EBIT, IMPORT_TEU, EXPORT_TEU,
COS_DOM_DSCH_TEU, COS_DOM_LOAD_TEU, TP_DSCH_TEU, TP_LOAD_TEU,
STEEL_DISCHARGE, FERTILISER_DISCHARGE, ALUMINIUM_DISCHARGE,
OTHER_DISCHARGE, STEEL_LOAD, ALUMINIUM_LOAD, OTHER_LOAD,
RESTOW_VY_TEU, RESTOW_B2B_TEU

Current datetime: {current_datetime}

Instructions:
- Generate only a valid SQL SELECT query.
- Use a WHERE clause if any filters are mentioned (e.g., ENTITY_NAME, GROUP_ENTITY, OKR, date range).
- If the user mentions a company/entity like "HICT", filter using:
  (ENTITY_NAME = 'value' OR ENTITY_CODE = 'value' OR GROUP_ENTITY = 'value')

- Map general terms like:
  - "volume" → OKR = 'VOLUME_TEU'
  - "EBITDA" or "profit" → OKR = 'EBITDA'
  - "import" → OKR = 'IMPORT_TEU'
  (Add others as necessary)

- Use appropriate time field based on user request:
  - "today" → use `DATE_ACTUALS` and hardcode current date as `'YYYY-MM-DD 00:00:00.000'`
  - "this week" → use `WTD_ACTUALS`
  - "this fortnight" → use `FTD_ACTUALS`
  - "this month" → use `MTD_ACTUALS`
  - "this quarter" → use `QTD_ACTUALS`
  - "this half year" → use `HTD_ACTUALS`
  - "this year" → use `YTD_ACTUALS`

- For last N months (e.g. last 6 months):
  - Use dynamic date filter in WHERE clause using `MONTHS >= EOMONTH(DATEADD(MONTH, -5, GETDATE()))`
  - Format `MONTHS` as 'MMM-yyyy' (e.g., 'Jan-2025') using `FORMAT(MONTHS, 'MMM-yyyy')` as MonthFormatted
  - In the PIVOT clause, use **static aliases** like [Jan-2025], [Feb-2025], etc.
    (Do not use EOMONTH or functions inside PIVOT)

- If user asks for specific range (e.g. Jan to May), use:
  `MONTHS BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`

- If the user asks for **trend or monthly output**, generate a PIVOT query with months as columns and values like MTD_ACTUALS.
- **Do NOT include ENTITY_NAME, ENTITY_CODE, or GROUP_ENTITY in the SELECT or GROUP BY unless the user explicitly requests to show results by entity.**

- Use aliases like AS [May-2025] for clarity
- Use only proper SQL Server syntax
- Only return the raw SQL query — no explanation, no markdown or formatting

User Request:
{user_input}

SQL Query:
"""


        prompt = PromptTemplate( input_variables=["user_input","current_datetime"],template=prompt_template,)

        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")  # Use appropriate Gemini setup
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(user_input=query,current_datetime=current_datetime)   
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

            Answer:""".strip())
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")  # Use appropriate Gemini setup
        chain = LLMChain(llm=llm, prompt=custom_prompt)
        return RetrievalQA.from_chain_type(
            llm=llm,
            retriever=retriever,
            chain_type="stuff",
            chain_type_kwargs={"prompt": custom_prompt.partial(policy_type=policy_type)},
            return_source_documents=True
        )