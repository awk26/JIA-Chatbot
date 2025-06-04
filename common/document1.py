import os
import datetime
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader,UnstructuredPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.schema.messages import AIMessage, HumanMessage
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from common.database import Database
from langchain.chains import LLMChain
from common.logs import log
from dotenv import load_dotenv
import glob
import re
load_dotenv()

# =============================
# Configuration
# =============================
os.environ["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEYS")  # Replace with your real key
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

def get_policy_count(policy_type):
    """Get the number of policies in a specific category."""
    try:
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
            return f"Invalid policy type: {policy_type}"
        
        base_folder = f"files/{folder_name}"
        
        if not os.path.exists(base_folder):
            return f"Folder not found: {base_folder}"
        
        # Count PDF files in the directory
        pdf_files = glob.glob(os.path.join(base_folder, "*.pdf"))
        count = len(pdf_files)
        
        log(f"Policy count for {policy_type}: {count}")
        return f"There are {count} policies in the {policy_type} category."
        
    except Exception as e:
        log(f"Error in get_policy_count: {e}")
        return f"Error counting policies: {str(e)}"

def get_policy_names(policy_type):
    """Get the names of all policies in a specific category."""
    try:
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
            return f"Invalid policy type: {policy_type}"
        
        base_folder = f"files/{folder_name}"
        
        if not os.path.exists(base_folder):
            return f"Folder not found: {base_folder}"
        
        # Get all PDF files in the directory
        pdf_files = glob.glob(os.path.join(base_folder, "*.pdf"))
        
        if not pdf_files:
            return f"No policies found in the {policy_type} category."
        
        # Extract file names without extension and path
        policy_names = []
        for file_path in pdf_files:
            file_name = os.path.basename(file_path)
            # Remove .pdf extension
            policy_name = os.path.splitext(file_name)[0]
            # Clean up the name (replace underscores with spaces, etc.)
            policy_name = policy_name.replace('_', ' ').replace('-', ' ')
            policy_names.append(policy_name)
        
        # Sort the names for better presentation
        policy_names.sort()
        
        log(f"Policy names for {policy_type}: {policy_names}")
        
        # Format the response
        response = f"Here are the {len(policy_names)} policies in the {policy_type} category:\n\n"
        for i, name in enumerate(policy_names, 1):
            response += f"{i}. {name}\n"
        
        return response.strip()
        
    except Exception as e:
        log(f"Error in get_policy_names: {e}")
        return f"Error retrieving policy names: {str(e)}"



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
        log(f"Error in load_vectorstore:{e}")

def build_qa_chain(policy_type, query, POLICY_NAMES=None, POLICY_COUNT=None, chat_history=None):
    """Build QA chain for the given policy type with enhanced policy query handling."""
    try:
        
        if policy_type == "MIS":
            log(f"User selected data base for Q&A:{policy_type}")
            current_datetime = datetime.datetime.now()
            
            # Build chat history context for MIS queries
            chat_context = ""
            if chat_history:
                recent_history = chat_history[-3:]  # Last 3 exchanges for context
                for exchange in recent_history:
                    if exchange.get("message") and exchange.get("response"):
                        chat_context += f"Previous Question: {exchange['message']}\n"
                        chat_context += f"Previous Response: {exchange['response']}\n\n"
            
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
                
                Chat History Context:
                {chat_context}
                
                Instructions:
                - Consider the chat history context when generating the SQL query
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
                - Always assign **aliases** to aggregate results:
                - For example: `SELECT COUNT(*) AS total`, `SUM(MTD_ACTUALS) AS total_mtd`, `AVG(QTD_ACTUALS) AS average_qtd`
                - Use only proper SQL Server syntax
                - Only return the raw SQL query — no explanation, no markdown or formatting

                User Request:
                {user_input}
                SQL Query:
                """
            prompt = PromptTemplate(input_variables=["user_input", "current_datetime", "chat_context"], template=prompt_template)
            llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")
            chain = LLMChain(llm=llm, prompt=prompt)
            result = chain.run(user_input=query, current_datetime=current_datetime, chat_context=chat_context)
            clean_sql = result.strip("`").split("sql\n")[-1].rsplit("```", 1)[0].strip()
            log(f"Sql query generated by Gemini:{clean_sql}")
            db = Database()
            data = db.execute(clean_sql)
            return data
        else:
            
            log(f"User selected Policy:{policy_type}")
            retriever = load_vectorstore(policy_type).as_retriever()

            custom_prompt = PromptTemplate(
                input_variables=["context", "question", "policy_type", "policy_count", "policy_names"],
                template="""
                You are a helpful assistant for answering {policy_type}-related questions.
                The company has {policy_count} policies: {policy_names}
                Use the following logic:
                - If the user's question asks about how many policies exist or what their names are, use the above policy info directly.
                - For any other detailed question about the policies, use only the information provided in the context below.
                - If the answer is not present in either the policy info or the context, respond with: "I'm sorry, but I don't have an answer to that."
                Context:
                {context}
                Question:
                {question}
                Answer:
                """.strip()
            )

            llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.1)

            memory = ConversationBufferMemory(
                memory_key="chat_history", 
                return_messages=True,
                output_key="answer"  # This is the fix - specify which output key to store in memory
            )

            # Populate memory from previous chat history
            if chat_history:
                for exchange in chat_history:
                    if exchange.get("message") and exchange.get("response"):
                        memory.chat_memory.add_user_message(exchange["message"])
                        memory.chat_memory.add_ai_message(exchange["response"])

            # Use proper method and inject the prompt via combine_docs_chain_kwargs
            return ConversationalRetrievalChain.from_llm(
                llm=llm,
                retriever=retriever,
                memory=memory,
                return_source_documents=True,
                combine_docs_chain_kwargs={
                    "prompt": custom_prompt.partial(
                        policy_type=policy_type,
                        policy_count=POLICY_COUNT,
                        policy_names=POLICY_NAMES
                    )
                }
            )
    except Exception as e:
        log(f"Exception occurred in build qa chain:{e}")