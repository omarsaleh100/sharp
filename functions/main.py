import firebase_admin
from firebase_admin import firestore
from firebase_functions import https_fn, scheduler_fn, options
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import os
import google.generativeai as genai
from yahooquery import Ticker
import feedparser
from zoneinfo import ZoneInfo # <--- Add this at the top

# Initialize Firebase
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

# --- CONFIGURATION ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# --- HELPER: UNBLOCKABLE NEWS (RSS) ---
def get_news_sentiment_rss(ticker):
    """
    Fetches news via RSS (Unblockable) and analyzes with Gemini.
    """
    if not GEMINI_API_KEY:
        return 0.0, "Market volatility is high due to trading volume."

    try:
        # Yahoo Finance RSS Feed - extremely reliable
        rss_url = f"https://finance.yahoo.com/rss/headline?s={ticker}"
        feed = feedparser.parse(rss_url)
        
        if not feed.entries:
            return 0.0, f"No major headlines for {ticker} today."

        # Get top 3 headlines
        headlines = [entry.title for entry in feed.entries[:3]]
        news_text = "\n".join(headlines)
        
        # Ask Gemini
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = f"""
        Analyze these headlines for {ticker}:
        {news_text}

        Return a JSON object:
        1. "drift_modifier": float (-0.3 to 0.3).
        2. "reason": string (max 15 words) explaining movement.
        """
        
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        result = json.loads(response.text)
        return result.get("drift_modifier", 0.0), result.get("reason", "News sentiment is driving price action.")

    except Exception as e:
        print(f"RSS/AI Error for {ticker}: {e}")
        return 0.0, "Technical factors are driving the price."

# --- 1. THE MATH ENGINE (Using yahooquery) ---
def calculate_market_params(tickers):
    results = {}
    
    try:
        print(f"Fetching bulk data for: {tickers} via yahooquery...")
        yq = Ticker(tickers)
        
        # 1. Get Recent Price (Real-time snapshot)
        # price returns a dict like: {'AAPL': {'regularMarketPrice': 180.5, ...}}
        price_data = yq.price
        
        # 2. Get Historical Data for Volatility (1 year)
        # yahooquery returns a DataFrame with MultiIndex (symbol, date)
        history = yq.history(period='1y', interval='1d')
        
        # Calculate Correlation Matrix
        # Pivot: Columns = symbols, Values = close
        if 'adjclose' in history.columns:
            closes = history.reset_index().pivot(index='date', columns='symbol', values='adjclose')
        else:
            closes = history.reset_index().pivot(index='date', columns='symbol', values='close')
            
        log_returns = np.log(closes / closes.shift(1))
        # Sanitize NaN to 0
        corr_matrix = log_returns.corr().fillna(0).values.tolist()

    except Exception as e:
        print(f"Data Fetch Error: {e}")
        # Fallback to Identity Matrix if data fails completely
        corr_matrix = np.eye(len(tickers)).tolist()
        closes = pd.DataFrame()
        price_data = {}

    for ticker in tickers:
        try:
            # A. GET PRICE
            if ticker in price_data and isinstance(price_data[ticker], dict):
                current_price = price_data[ticker].get('regularMarketPrice')
                if not current_price:
                     # Fallback to last history close
                     current_price = closes[ticker].iloc[-1] if ticker in closes else 100.0
            else:
                 current_price = 100.0

            # B. CALCULATE VOLATILITY
            if ticker in closes:
                series = closes[ticker]
                returns = np.log(series / series.shift(1))
                sigma = float(returns.std() * (252 ** 0.5))
                mu_base = float(returns.mean() * 252)
            else:
                sigma = 0.25
                mu_base = 0.05
            
            # Handle NaN/Infinity
            if np.isnan(sigma): sigma = 0.25
            if np.isnan(mu_base): mu_base = 0.05

            # C. AI SENTIMENT (RSS)
            sentiment_drift, sentiment_reason = get_news_sentiment_rss(ticker)
            final_mu = mu_base + sentiment_drift

            results[ticker] = {
                "price": float(current_price),
                "mu": final_mu,
                "sigma": sigma,
                "narrative": sentiment_reason
            }

        except Exception as e:
            print(f"Error processing {ticker}: {e}")
            results[ticker] = {
                "price": 100.0, "mu": 0.05, "sigma": 0.2, "narrative": "Simulation Mode (Data Unavailable)"
            }

    return results, corr_matrix

# --- 2. THE DAILY JOB (HTTP Trigger) ---
@https_fn.on_request()
def generate_daily_market(req: https_fn.Request) -> https_fn.Response:
    print("Generating daily market assets...")
    
    candidate_pool = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 
        'NVDA', 'AMD', 'NFLX', 'META', 'SPY',
        'COIN', 'PLTR', 'GME', 'HOOD', 'UBER'
    ]
    
    assets_payload = []
    
    try:
        # Bulk fetch for the selection screen
        # We use yahooquery for speed and reliability
        yq = Ticker(candidate_pool)
        prices = yq.price
        
        # Get 1mo history for a volatility snapshot
        hist = yq.history(period='1mo', interval='1d')
        
        for ticker in candidate_pool:
            try:
                # 1. Get Price
                if ticker not in prices or not isinstance(prices[ticker], dict):
                    print(f"Skipping {ticker} (No price)")
                    continue
                    
                price = prices[ticker].get('regularMarketPrice', 0.0)
                if price == 0.0: continue

                # 2. Calculate Volatility (Standard Deviation of Returns)
                vol = 0.2 # Default
                try:
                    t_data = hist.xs(ticker) 
                    if len(t_data) > 2:
                        col = 'adjclose' if 'adjclose' in t_data else 'close'
                        # Log returns: ln(P_t / P_{t-1})
                        log_ret = np.log(t_data[col] / t_data[col].shift(1))
                        # Annualize volatility (sqrt(252))
                        vol = float(log_ret.std() * (252 ** 0.5))
                except:
                    pass

                assets_payload.append({
                    "symbol": ticker,
                    "price": float(price),
                    "volatility": vol if not np.isnan(vol) else 0.2
                })
                
            except Exception as e:
                print(f"Error parsing {ticker}: {e}")
                continue
                
    except Exception as e:
        print(f"Critical Data Error: {e}")
        # Fallback: Generate Mock Data so the app doesn't break
        for ticker in candidate_pool[:5]:
             assets_payload.append({"symbol": ticker, "price": 150.0, "volatility": 0.3})

    et_now = datetime.now(ZoneInfo("America/New_York"))
    
    daily_data = {
        "date": et_now.strftime("%Y-%m-%d"), # Game date is now ET
        "assets": assets_payload,
        "lastUpdated": et_now.isoformat(),    # Timestamp is now timezone-aware
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    
    db.collection('config').document('dailyAssets').set(daily_data)
    print(f"Daily assets updated with {len(assets_payload)} stocks.")
    return https_fn.Response(json.dumps({"success": True, "count": len(assets_payload)}), status=200)
# --- 3. THE GAME INITIALIZER ---
@https_fn.on_request(
    cors=options.CorsOptions(
        cors_origins="*", 
        cors_methods=["GET", "POST"]
    )
)
def start_simulation(req: https_fn.Request) -> https_fn.Response:
    if req.method == 'OPTIONS':
        return https_fn.Response("", status=204)

    try:
        data = req.get_json()
        selected_tickers = data.get('selectedTickers', [])
        
        if not selected_tickers:
            return https_fn.Response(json.dumps({"error": "No tickers"}), status=400)

        market_data, correlation = calculate_market_params(selected_tickers)
        
        game_state = {
            "turn": 0,
            "max_turns": 20,
            "cash": 1000000,
            "portfolio": {
                ticker: {
                    "shares": 0,
                    "price": data['price'],
                    "mu": data['mu'],
                    "sigma": data['sigma'],
                    "narrative": data['narrative']
                }
                for ticker, data in market_data.items()
            },
            "correlation_matrix": correlation
        }
        
        return https_fn.Response(json.dumps(game_state), content_type="application/json")
        
    except Exception as e:
        return https_fn.Response(json.dumps({"error": str(e)}), status=500)