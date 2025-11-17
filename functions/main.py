import firebase_admin
from firebase_admin import firestore
import os
import requests  # We'll use this for the financial API

# Import Firebase Functions libraries
from firebase_functions import scheduler_fn
from firebase_admin import credentials

firebase_admin.initialize_app()

# Get the Finnhub API key from the environment
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")

FALLBACK_TICKERS = [
    'AAPL', 'MSFT', 'GOOG', 'AMZN', 'TSLA', 'NVDA', 'JPM', 'JNJ', 'V', 'PG',
    'UNH', 'HD', 'MA', 'PYPL', 'DIS'
]

def get_market_movers():
    """
    Fetches the top 15 tickers from the Finnhub API.
    If it fails, it returns a hard-coded fallback list.
    """
    if not FINNHUB_API_KEY:
        print("FATAL: FINNHUB_API_KEY secret not set. Using fallback list.")
        return FALLBACK_TICKERS

    # This endpoint gets all symbols for the US exchange.
    url = f"https://finnhub.io/api/v1/stock/symbol?exchange=US&token={FINNHUB_API_KEY}"
    
    try:
        response = requests.get(url, timeout=5) # Add a 5-second timeout
        response.raise_for_status()
        data = response.json()
        
        if not isinstance(data, list):
             print(f"Error: Finnhub API did not return a list. Response: {data}. Using fallback list.")
             return FALLBACK_TICKERS

        # Looser filter: just find symbols that don't contain a '.'
        tickers = [
            item['symbol'] for item in data 
            if item.get('symbol') and '.' not in item['symbol']
        ]
        
        top_15_tickers = tickers[:15]
        
        if len(top_15_tickers) > 0:
            print(f"Successfully fetched {len(top_15_tickers)} tickers from API.")
            return top_15_tickers
        else:
            print(f"Warning: Fetched 0 valid tickers from API. Using fallback list.")
            return FALLBACK_TICKERS

    except Exception as e:
        print(f"Error fetching data from Finnhub: {e}. Using fallback list.")
        return FALLBACK_TICKERS

#
# The @scheduler_fn.on_schedule function below this line
# should remain exactly the same. Do not change it.
#