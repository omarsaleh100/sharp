import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn, scheduler_fn, options
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
import json

# Initialize Firebase
# We check if app is already initialized to prevent hot-reload errors during local dev
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# --- UTILITIES ---

def calculate_gbm_params(tickers):
    """
    Fetches 1y history and calculates Drift (mu) and Volatility (sigma)
    for Geometric Brownian Motion.
    """
    try:
        # Fetch data (1 year lookback)
        # 'Adj Close' is best for returns calculation
        data = yf.download(tickers, period="1y", interval="1d", progress=False)['Adj Close']
        
        # Handle single ticker case (pandas series vs dataframe)
        if len(tickers) == 1:
            data = data.to_frame(tickers[0])
            
        # Calculate Log Returns: ln(Price_t / Price_{t-1})
        log_returns = np.log(data / data.shift(1))
        
        # Annualize parameters (252 trading days)
        # Mean of daily returns * 252 = Annual Drift
        drift = log_returns.mean() * 252
        
        # Std Dev of daily returns * sqrt(252) = Annual Volatility
        volatility = log_returns.std() * (252 ** 0.5)
        
        # Correlation Matrix (for multi-asset simulation later)
        correlation = log_returns.corr()
        
        # Get the most recent price to start the sim
        last_prices = data.iloc[-1]

        return {
            "drift": drift.to_dict(),
            "volatility": volatility.to_dict(),
            "correlation": correlation.values.tolist(), 
            "initial_prices": last_prices.to_dict()
        }
    except Exception as e:
        print(f"Error calculating params: {e}")
        return None

# --- CLOUD FUNCTIONS ---

@scheduler_fn.on_schedule(schedule="every 24 hours", timeout_sec=300, memory=options.MemoryOption.GB_1)
def generate_daily_market(event: scheduler_fn.ScheduledEvent) -> None:
    """
    CRON Job: Runs once a day to pick the 'Daily 15' stocks.
    """
    print("Generating daily market assets...")
    
    # MVP: Pool of popular tickers
    candidate_pool = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 
        'NVDA', 'AMD', 'NFLX', 'META', 'SPY',
        'COIN', 'PLTR', 'GME', 'HOOD', 'UBER'
    ]
    
    params = calculate_gbm_params(candidate_pool)
    
    if not params:
        print("Failed to fetch market data.")
        return

    daily_data = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "assets": [
            {
                "symbol": ticker,
                "drift": params['drift'].get(ticker, 0),
                "volatility": params['volatility'].get(ticker, 0),
                "price": params['initial_prices'].get(ticker, 0)
            } 
            for ticker in candidate_pool
        ],
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    
    # Writes to 'config/dailyAssets' in Firestore
    db.collection('config').document('dailyAssets').set(daily_data)
    print("Daily assets updated successfully.")


@https_fn.on_request(cors=options.CorsOptions(cors_origins="*", methods=["POST"]))
def start_simulation(req: https_fn.Request) -> https_fn.Response:
    """
    API Endpoint: Called by Frontend when user clicks 'Start'.
    Returns the specific math parameters for the user's chosen stocks.
    """
    try:
        data = req.get_json()
        selected_tickers = data.get('selectedTickers', [])
        
        if not selected_tickers or len(selected_tickers) < 1:
            return https_fn.Response(json.dumps({"error": "No tickers selected"}), status=400)

        # Calculate parameters specifically for the user's portfolio
        params = calculate_gbm_params(selected_tickers)
        
        if not params:
             return https_fn.Response(json.dumps({"error": "Failed to fetch financial data"}), status=500)

        game_state = {
            "turn": 0,
            "max_turns": 20,
            "cash": 1000000,
            "portfolio": {
                ticker: {
                    "shares": 0,
                    "price": params['initial_prices'][ticker],
                    "mu": params['drift'][ticker],      # Drift
                    "sigma": params['volatility'][ticker] # Volatility
                }
                for ticker in selected_tickers
            },
            "correlation_matrix": params['correlation']
        }
        
        return https_fn.Response(json.dumps(game_state), content_type="application/json")
        
    except Exception as e:
        return https_fn.Response(json.dumps({"error": str(e)}), status=500)