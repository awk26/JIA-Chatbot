import os
import glob
from typing import List
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain.embeddings.base import Embeddings
from google.generativeai import configure, embed_content
from dotenv import load_dotenv
load_dotenv()

class GeminiEmbeddings(Embeddings):
    """LangChain compatible wrapper for Google's Gemini embedding model."""
    
    def __init__(self, api_key=None, model_name="models/embedding-001", dimension_size=384):
        """Initialize the Gemini embeddings wrapper.
        
        Args:
            api_key: Your Google AI API key
            model_name: The Gemini embedding model to use
            dimension_size: Target dimension size for embeddings (for compatibility with existing databases)
        """
        if api_key is None:
            api_key = os.getenv("GOOGLE_API_KEYS")
            if api_key is None:
                raise ValueError(
                    "Google API key is required. Set it through the api_key parameter or GOOGLE_API_KEY environment variable."
                )
        
        # Configure the Google Generative AI library with your API key
        configure(api_key=api_key)
        self.model_name = model_name
        
        # Store the target dimension size (for compatibility with existing databases)
        self.dimension_size = dimension_size
    
    def _resize_embedding(self, embedding: List[float]) -> List[float]:
        """Resize the embedding vector to match the target dimension size.
        
        This is needed when transitioning between models with different vector dimensions.
        
        Args:
            embedding: Original embedding vector
            
        Returns:
            Resized embedding vector
        """
        original_size = len(embedding)
        
        # If the original size matches the target size, return as is
        if original_size == self.dimension_size:
            return embedding
            
        # If original is larger than target, truncate
        elif original_size > self.dimension_size:
            return embedding[:self.dimension_size]
            
        # If original is smaller than target, pad with zeros
        else:
            return embedding + [0.0] * (self.dimension_size - original_size)
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of documents.
        
        Args:
            texts: List of text strings to embed
            
        Returns:
            List of embedding vectors
        """
        embeddings = []
        # Process texts in batches to avoid potential API limits
        for text in texts:
            embedding_result = embed_content(
                model=self.model_name,
                content=text,
                task_type="retrieval_document"
            )
            # Resize embedding to match the target dimension size
            resized_embedding = self._resize_embedding(embedding_result["embedding"])
            embeddings.append(resized_embedding)
        return embeddings
    
    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a query string.
        
        Args:
            text: Query text to embed
            
        Returns:
            Embedding vector
        """
        embedding_result = embed_content(
            model=self.model_name,
            content=text,
            task_type="retrieval_query"
        )
        # Resize embedding to match the target dimension size
        return self._resize_embedding(embedding_result["embedding"])


class DocumentProcessor:
    """Class to handle document processing and vector storage."""
    
    # Folder structure for document organization
    FOLDER_STRUCTURE = {
        "IT_Policy": "./files/IT Policy",
        "HR_Policy": "./files/HR Policy",
        "SOP": {
            "SOPP_Operation": "./files/SOP/Operation",
            "SOPP_Procurement": "./files/SOP/Procurement",
            "SOPP_Revenue": "./files/SOP/Revenue",
            "SOPP_Sales": "./files/SOP/Sales"
        }
    }
    
    # File patterns to look for in each folder
    FILE_PATTERNS = ["*.pdf", "*.docx"]
    
    def __init__(self, base_dir='./files', chroma_dir='./chroma_db', api_key=None, dimension_size=384):
        """Initialize the document processor with directory configurations."""
        self.base_dir = base_dir
        self.chroma_dir = chroma_dir
        self.vector_stores = {}  # Dictionary to store vector stores by category
        self.processed_files = {}  # Dictionary to track processed files by category
        self.api_key = api_key  # Google API key for Gemini
        self.dimension_size = dimension_size  # Dimension size for embeddings
        
        # Create necessary directories
        self._create_folder_structure()
    
    def _create_folder_structure(self):
        """Create the folder structure if it doesn't exist."""
        # Create base directory
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.chroma_dir, exist_ok=True)
        
        # Create top-level folders
        for folder in ["IT Policy", "HR Policy", "SOP"]:
            folder_path = os.path.join(self.base_dir, folder)
            os.makedirs(folder_path, exist_ok=True)
        
        # Create SOP subfolders
        sop_path = os.path.join(self.base_dir, "SOP")
        for subfolder in ["Operation", "Procurement", "Revenue", "Sales"]:
            subfolder_path = os.path.join(sop_path, subfolder)
            os.makedirs(subfolder_path, exist_ok=True)
    
    def init_documents(self):
        """Process all PDFs and Word documents by category into vector stores."""
        # Process each top-level folder
        total_categories_processed = 0
        
        # Process IT and HR Policy folders
        for category, folder_path in [("IT_Policy", self.FOLDER_STRUCTURE["IT_Policy"]), 
                                    ("HR_Policy", self.FOLDER_STRUCTURE["HR_Policy"])]:
            if self._process_category(category, folder_path):
                total_categories_processed += 1
        
        # Process each SOP subfolder
        for sop_category, sop_path in self.FOLDER_STRUCTURE["SOP"].items():
            if self._process_category(sop_category, sop_path):
                total_categories_processed += 1
        
        print(f"\nTotal categories processed: {total_categories_processed}")
        return total_categories_processed > 0
    
    def _process_category(self, category, folder_path):
        """Process all documents in a specific category folder."""
        all_files = []
        
        # Find all files matching patterns in the folder
        for pattern in self.FILE_PATTERNS:
            all_files.extend(glob.glob(os.path.join(folder_path, pattern)))
        
        print(f"Category {category}: Found {len(all_files)} files in {folder_path}")
        
        if not all_files:
            print(f"No files found for category {category}")
            return False
        
        all_chunks = []
        category_files = []
        
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
                
                # Add metadata to each document
                for doc in documents:
                    doc.metadata["source"] = file_name
                    doc.metadata["category"] = category
                    doc.metadata["full_path"] = file_path
                
                # Split the document into chunks
                text_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=1000,
                    chunk_overlap=200,
                    length_function=len
                )
                chunks = text_splitter.split_documents(documents)
                
                all_chunks.extend(chunks)
                category_files.append(file_name)
                print(f"Successfully processed: {file_name} ({len(chunks)} chunks)")
            except Exception as e:
                print(f"Error processing {file_name}: {str(e)}")
        
        # Create embeddings for category documents
        if all_chunks:
            # Use Gemini embeddings instead of HuggingFace
            embeddings = GeminiEmbeddings(api_key=self.api_key, dimension_size=self.dimension_size)
            
            # Create vector store with category documents
            category_db_dir = os.path.join(self.chroma_dir, category)
            os.makedirs(category_db_dir, exist_ok=True)
            
            vector_store = Chroma.from_documents(
                documents=all_chunks,
                embedding=embeddings,
                persist_directory=category_db_dir
            )
            vector_store.persist()
            
            self.vector_stores[category] = vector_store
            self.processed_files[category] = category_files
            
            print(f"Created vector store for {category} with {len(all_chunks)} chunks from {len(category_files)} documents")
            return True
        
        return False
    
    def get_vector_store(self, category=None):
        """Returns the vector store for a specific category or all vector stores."""
        if category and category in self.vector_stores:
            return {category: self.vector_stores[category]}
        return self.vector_stores
    
    def get_processed_files(self):
        """Returns the dictionary of processed files by category."""
        return self.processed_files
    
    def get_all_document_names(self):
        """Returns a list of all processed document names."""
        all_docs = []
        for category, files in self.processed_files.items():
            for file in files:
                all_docs.append({"category": category, "filename": file})
        return all_docs
    
    def has_documents(self):
        """Check if any documents have been processed."""
        return len(self.vector_stores) > 0
    
    def reload_vector_stores(self):
        """Reload all vector stores from disk after server restart."""
        self.vector_stores = {}
        
        # Check if the chroma directory exists and has subdirectories
        if not os.path.exists(self.chroma_dir):
            return False
        
        # Get all subdirectories in the chroma directory (each represents a category)
        category_dirs = [d for d in os.listdir(self.chroma_dir) 
                        if os.path.isdir(os.path.join(self.chroma_dir, d))]
        
        if not category_dirs:
            return False
        
        # Reload each vector store
        for category in category_dirs:
            category_db_dir = os.path.join(self.chroma_dir, category)
            
            try:
                # Use Gemini embeddings for reloading as well
                embeddings = GeminiEmbeddings(api_key=self.api_key, dimension_size=self.dimension_size)
                vector_store = Chroma(
                    persist_directory=category_db_dir,
                    embedding_function=embeddings
                )
                
                self.vector_stores[category] = vector_store
                
                # Try to extract file information
                all_metadatas = vector_store._collection.get()["metadatas"]
                unique_sources = set()
                for metadata in all_metadatas:
                    if metadata and "source" in metadata:
                        unique_sources.add(metadata["source"])
                
                self.processed_files[category] = list(unique_sources)
                print(f"Reloaded vector store for {category} with {len(unique_sources)} documents")
            except Exception as e:
                print(f"Error reloading vector store for {category}: {str(e)}")
        
        return len(self.vector_stores) > 0
    
    def get_category_keywords(self):
        """Returns keywords associated with each category for relevance detection."""
        return {
            "HR_Policy": ["hr", "human resources", "employee", "staff", "personnel", "leave", "vacation"],
            "IT_Policy": ["it", "information technology", "computer", "software", "hardware", "security", "password"],
            "SOPP_Operation": ["operation", "operational", "procedure", "process", "workflow"],
            "SOPP_Procurement": ["procurement", "purchase", "supplier", "vendor", "buying"],
            "SOPP_Revenue": ["revenue", "income", "earning", "money", "financial"],
            "SOPP_Sales": ["sales", "selling", "marketing", "customer", "client"]
        }
    
    def get_folder_structure(self):
        """Returns a user-friendly representation of the folder structure."""
        return {
            "IT_Policy": "IT Policy",
            "HR_Policy": "HR Policy",
            "SOP": {
                "SOPP_Operation": "Operation",
                "SOPP_Procurement": "Procurement",
                "SOPP_Revenue": "Revenue",
                "SOPP_Sales": "Sales"
            }
        }