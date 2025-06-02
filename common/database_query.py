
from flask import  jsonify, make_response
import pandas as pd
import google.generativeai as genai
import json
import math
from decimal import Decimal


def sanitize_data_for_json(data):
    """
    Recursively sanitize data to make it JSON serializable
    Converts NaN, None, and Decimal values to appropriate JSON-safe values
    """
    if isinstance(data, dict):
        return {key: sanitize_data_for_json(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [sanitize_data_for_json(item) for item in data]
    elif data is None:
        return None  # Keep None as null in JSON
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return None  # Convert NaN and Inf to null
        return data
    elif isinstance(data, Decimal):
        return float(data)  # Convert Decimal to float
    else:
        return data

def generate_natural_response(model,data, message):

    if data=="No Data Found":
        prompt1=f"""If the data response is {data}, generate a polite and helpful response that acknowledges the issue. The response should be in a conversational tone, adapting to the user's message style. Offer assistance by asking for additional details to refine the search or find relevant information. Ensure the user feels supported and encouraged to clarify their query. And 'If my SQL query returns "No Data Found", I will respond with something like this:' do not use this type of line and you response is short and simple do not use extra I'll let you know in a friendly way, something like: """
        response = model.start_chat().send_message(prompt1)
        return response.text
    
    structured_data = "\n".join([str(row) for row in data])

    prompt = f"""Here is data retrieved from a database in response to the user query: "{message}"

                DATA:
                {structured_data}

                IMPORTANT INSTRUCTIONS:
                1. Assume the data above directly answers the user's question
                2. Provide a clear, direct answer using ONLY the information in the data
                3. Format your response as a complete sentence that directly answers the question
                4. DO NOT mention limitations of the data or suggest additional queries
                5. DO NOT say "According to the data" or similar phrases
                6. If the data shows a count or number, state that number directly in your response
                7. Keep your response concise (1-2 sentences maximum)

                For example:
                - If user asked "how many portcalls in Jan 2025" and data shows 1185, respond: "Total portcalls created in January 2025 is 1185."
                - If user asked about revenue and data shows $50,000, respond: "The revenue is $50,000."

                Your direct answer to "{message}":"""
    
    response =model.start_chat().send_message(prompt)
    return response.text


def database_query(response,chart,chart_type,user_message):
        genai.configure(api_key="AIzaSyCeXy0EzwPA4X2oqCvi3bogrysnxB-T5jM")
        config = {
            "temperature": 0,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 8192,
            "response_mime_type": "text/plain",
        }
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config=config,
            
        )

        if isinstance(response, list):
         
            df = pd.DataFrame(response)
            columns_str = ','.join(df.columns.tolist())

            if len(df.columns) > 1:
                if chart:
                 
                    labels=df.columns.tolist()
                    values=df.iloc[0, :].tolist()
                    if len(labels)==2:
                      
                        labels=df.iloc[:,0].tolist()
                        values=df.iloc[:,1].tolist()
                
                    response_data1 = {
                        'response': response,
                        'chartData': {
                            'labels':  labels, # First column as Labels
                            'values': values,  # Second column as Values
                            'title': 'Generated Chart',
                            'chart_type': chart_type
                        },
                        'suggestions':""
                    }
                    response_data = sanitize_data_for_json(response_data1)
                    
                else:
                    response_data = {'response': response,'suggestions':""}
                print("444444444444444444444444",response_data)
                resp = make_response(jsonify(response_data))
                print("aaaaaaaaaaaaaa",resp)
                resp.set_cookie('columns', columns_str, max_age=60*60*24, domain="127.0.0.1")
                return resp

            else:
                natural_response =generate_natural_response(model,response, user_message)
                return jsonify({'response': natural_response,'suggestions':""})
        elif response=="No Data Found":
         
            natural_response = generate_natural_response(model,response, user_message)
            return jsonify({'response': natural_response,'suggestions':""})

        else:
        
            structured_response = format_structured_response(response)
            return jsonify({'response': structured_response,'suggestions':""})


def format_structured_response(text):
    """
    Parse the text response and identify code blocks, lists, and other structured elements.
    Return a formatted response that the frontend can render properly.
    """
    # For simple implementation, we'll return the text as is
    # In a more advanced implementation, you could parse the text here
    # to identify code blocks, lists, and other structured elements
    
    # Example of how you might detect code blocks:
    import re
    
    # Check if there are code blocks
    code_blocks = re.findall(r'```(\w*)\n([\s\S]*?)```', text)
    
    if code_blocks:
        # For simplicity, we'll just return the first code block found
        language, code = code_blocks[0]
        # Remove the code block from the text
        text = re.sub(r'```\w*\n[\s\S]*?```', '', text, 1).strip()
        
        return {
            'text': text,
            'code': code,
            'language': language or 'plain'
        }
    
    # If no code blocks, return the text as is
    return text
