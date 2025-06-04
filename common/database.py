import os
import pymssql
from dbutils.pooled_db import PooledDB
from dotenv import load_dotenv
from common.logs import log
import sys


# Load environment variables
load_dotenv()

class Database:
    __raw_connection = None

    def __init__(self):
        try:
            self.host = os.getenv("HOST")
            self.username = os.getenv("USERNAME")
            self.password = os.getenv("PASSWORD")
            self.port = int(os.getenv("PORT"))
            self.db_name = os.getenv("DB_NAME")

            # Initialize connection pool
            Database.__raw_connection = PooledDB(
                creator=pymssql,
                server=self.host,
                user=self.username,
                password=self.password,
                database=self.db_name,
                port=self.port,
                autocommit=True,
                maxconnections=5
            )

            # Print connection details (for debugging)
           
        
        except Exception as e:
            log(f"Error initializing database connection: {e}")
            sys.exit(1)  # Exit if the database connection fails

    # Execute a query (returns all results)
    def execute(self, query, args=None):
        connection = None
        try:
            connection = Database.__raw_connection.connection()
            with connection.cursor(as_dict=True) as cursor:  # Use as_dict=True to return results as dicts
                cursor.execute(query, args)
                result = cursor.fetchall()
            return result
        except Exception as e:
            log(f"Exception occurred in execute(): {e}")
            return []
        finally:
            if connection:
                connection.close()

    # Get multiple records
    def getall(self, query, args=None):
        return self.execute(query, args)

    # Get a single record
    def getone(self, query, args=None):
        records = self.execute(query, args)
        return records[0] if records else None

# if __name__ == "__main__":
#     db = Database()

#     query = "SELECT TOP 10 * FROM [MIS].[PERIODIC_REPORT];"
#     records = db.getall(query)
#     print(len(records))
#     # for row in records:
#     #     print(row)


