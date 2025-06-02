def charts(message):
    chart = False
    chart_type = None
    
    chart_keywords = {
        'pie': ['pie', 'donut'],
        'bar': ['bar', 'histogram'],
        'line': ['line', 'trends','trend'],
        'graph': ['graph', 'plot','charts','chart']
    }

    message_words = message.lower().split(" ")
    
    for word in message_words:
        for c_type, keywords in chart_keywords.items():
            if word in keywords:
                chart = True
                chart_type = c_type
              
                return chart, chart_type  # Return as soon as a chart type is found
  
    return chart, chart_type         

   
