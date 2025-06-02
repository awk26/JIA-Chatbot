import os
import json
from datetime import datetime

class ChatHistoryManager:
    """Class to handle chat history operations."""
    
    def __init__(self, chat_history_dir='./chat_histories'):
        """Initialize the chat history manager with directory configuration."""
        self.chat_history_dir = chat_history_dir
        os.makedirs(self.chat_history_dir, exist_ok=True)
    
    def save_chat_history(self, conversation_id, chat_history):
        """Save chat history to a JSON file."""
        def default_serializer(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            return str(obj)  # fallback for other non-serializable types

        file_path = os.path.join(self.chat_history_dir, f"{conversation_id}.json")
        with open(file_path, 'w') as f:
            json.dump(chat_history, f, indent=2, default=default_serializer)
    
    def load_chat_history(self, conversation_id):
        """Load chat history from a JSON file."""
        file_path = os.path.join(self.chat_history_dir, f"{conversation_id}.json")
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
        return []
    
    def add_to_history(self, conversation_id, message, response, sources, category=None):
        """Add a new exchange to the chat history."""
        # Load existing history
        chat_history = self.load_chat_history(conversation_id)
        
        # Create the new entry
        timestamp = datetime.now().strftime("%d %b, %I:%M %p")
        new_entry = {
            "message": message,
            "response": response,
            "sources": sources,
            "timestamp": timestamp,
            "category": category if category else "multiple"
        }
        
        # Add to history and save
        chat_history.append(new_entry)
        self.save_chat_history(conversation_id, chat_history)
        
        return timestamp
    
    def get_chat_history(self, conversation_id):
        """Return the chat history for a specific conversation."""
        return self.load_chat_history(conversation_id)
    
    def delete_chat_history(self, conversation_id):
        """Delete chat history for a specific conversation."""
        file_path = os.path.join(self.chat_history_dir, f"{conversation_id}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False
    
    def list_conversations(self):
        """List all available conversation IDs."""
        conversations = []
        for file in os.listdir(self.chat_history_dir):
            if file.endswith('.json'):
                conversations.append(file[:-5])  # Remove .json extension
        return conversations
