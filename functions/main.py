import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn, scheduler_fn, options
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
import json

# Initialize Firebase
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# --- 1. THE MATH ENGINE ---
def calculate_gbm_params(tickers):
    try:
        print(f"Attempting to fetch data for: {tickers}")
        
        # Try fetching real data
        data = yf.download(tickers, period="1y", interval="1d", progress=False)['Adj Close']
        
        if data is None or data.empty:
            raise ValueError("Yahoo Finance returned no data.")

        if len(tickers) == 1:
            data = data.to_frame(tickers[0])
            
        log_returns = np.log(data / data.shift(1))
        drift = log_returns.mean() * 252
        volatility = log_returns.std() * (252 ** 0.5)
        correlation = log_returns.corr().values.tolist()
        last_prices = data.iloc[-1].to_dict()
        
        print("Successfully fetched REAL data.")
        return {
            "drift": drift.to_dict(),
            "volatility": volatility.to_dict(),
            "correlation": correlation,
            "initial_prices": last_prices
        }
    except Exception as e:
        print(f"⚠️ Yahoo API failed ({e}). Switching to MOCK data.")
        
        # Mock Data Fallback
        mock_prices = {
            'AAPL': 185.50, 'MSFT': 420.00, 'GOOGL': 175.20, 'AMZN': 180.00, 'TSLA': 170.00,
            'NVDA': 880.00, 'AMD': 160.00, 'NFLX': 600.00, 'META': 490.00, 'SPY': 510.00,
            'COIN': 250.00, 'PLTR': 24.00, 'GME': 14.50, 'HOOD': 18.00, 'UBER': 78.00
        }
        
        mock_drift = { t: 0.15 for t in tickers } 
        mock_volatility = { t: 0.25 for t in tickers }
        for risky in ['TSLA', 'COIN', 'GME', 'HOOD', 'PLTR']:
            if risky in mock_volatility: mock_volatility[risky] = 0.65
            
        mock_corr = np.eye(len(tickers)).tolist()

        return {
            "drift": mock_drift,
            "volatility": mock_volatility,
            "correlation": mock_corr,
            "initial_prices": {k: v for k,v in mock_prices.items() if k in tickers}
        }

# --- 2. THE DAILY JOB ---
@scheduler_fn.on_schedule(schedule="every 24 hours", timeout_sec=300, memory=options.MemoryOption.GB_1)
def generate_daily_market(event: scheduler_fn.ScheduledEvent) -> None:
    print("Generating daily market assets...")
    
    candidate_pool = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 
        'NVDA', 'AMD', 'NFLX', 'META', 'SPY',
        'COIN', 'PLTR', 'GME', 'HOOD', 'UBER'
    ]
    
    params = calculate_gbm_params(candidate_pool)
    
    assets_payload = []
    for ticker in candidate_pool:
        if ticker in params['initial_prices']:
            assets_payload.append({
                "symbol": ticker,
                "drift": params['drift'].get(ticker, 0.1),
                "volatility": params['volatility'].get(ticker, 0.3),
                "price": params['initial_prices'].get(ticker, 100.0)
            })

    daily_data = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "assets": assets_payload,
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    
    db.collection('config').document('dailyAssets').set(daily_data)
    print(f"Daily assets updated successfully.")

# --- 3. THE GAME INITIALIZER (Manual CORS Fix) ---
@https_fn.on_request()
def start_simulation(req: https_fn.Request) -> https_fn.Response:
    # 1. Define Standard CORS Headers
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
    }

    # 2. Handle Preflight (OPTIONS) Request immediately
    if req.method == 'OPTIONS':
        return https_fn.Response("", status=204, headers=cors_headers)

    # 3. Process the actual POST request
    try:
        data = req.get_json()
        selected_tickers = data.get('selectedTickers', [])
        
        if not selected_tickers:
            return https_fn.Response(
                json.dumps({"error": "No tickers selected"}), 
                status=400, 
                headers=cors_headers
            )

        params = calculate_gbm_params(selected_tickers)
        
        game_state = {
            "turn": 0,
            "max_turns": 20,
            "cash": 1000000,
            "portfolio": {
                ticker: {
                    "shares": 0,
                    "price": params['initial_prices'].get(ticker, 100),
                    "mu": params['drift'].get(ticker, 0.1),
                    "sigma": params['volatility'].get(ticker, 0.3)
                }
                for ticker in selected_tickers
            },
            "correlation_matrix": params['correlation']
        }
        
        return https_fn.Response(
            json.dumps(game_state), 
            content_type="application/json", 
            headers=cors_headers
        )
        
    except Exception as e:
        return https_fn.Response(
            json.dumps({"error": str(e)}), 
            status=500, 
            headers=cors_headers
        )