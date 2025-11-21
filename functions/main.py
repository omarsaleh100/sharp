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
from zoneinfo import ZoneInfo
import concurrent.futures  # <--- ADD THIS

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
# ... imports remain the same ...

# --- 1. THE MATH ENGINE (With Strict Timeouts) ---
def calculate_market_params(tickers):
    print(f"Processing tickers: {tickers}")
    
    # Data containers
    results = {}
    corr_matrix = np.eye(len(tickers)).tolist()
    market_data = {"prices": {}, "history": pd.DataFrame()}
    sentiment_map = {}

    # --- WORKERS ---
    def fetch_yahoo_worker():
        try:
            yq = Ticker(tickers)
            market_data["prices"] = yq.price
            market_data["history"] = yq.history(period='1y', interval='1d')
            return True
        except Exception as e:
            print(f"Yahoo Worker Failed: {e}")
            return False

    def fetch_sentiment_worker():
        # Create a localized executor so we don't block the main thread
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as inner_exec:
            future_to_ticker = {
                inner_exec.submit(lambda t: get_news_sentiment_rss(t)): t 
                for t in tickers
            }
            for future in concurrent.futures.as_completed(future_to_ticker):
                try:
                    tkr = future_to_ticker[future]
                    sentiment_map[tkr] = future.result()
                except Exception:
                    pass
        return True

    # --- MAIN CONTROLLER ---
    # We DO NOT use the 'with' context manager here because it forces a wait.
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    
    try:
        yahoo_future = executor.submit(fetch_yahoo_worker)
        sentiment_future = executor.submit(fetch_sentiment_worker)

        has_real_data = False
        
        # 1. Yahoo Data (Strict 4s Timeout)
        try:
            has_real_data = yahoo_future.result(timeout=4)
        except concurrent.futures.TimeoutError:
            print("⚠️ Yahoo Data timed out. Skipping.")
        except Exception as e:
            print(f"Yahoo Error: {e}")

        # 2. Sentiment (Strict 2s Timeout)
        try:
            sentiment_future.result(timeout=2)
        except concurrent.futures.TimeoutError:
            print("⚠️ Sentiment analysis timed out. Skipping.")
        except Exception:
            pass

    finally:
        # CRITICAL: This tells Python "Don't wait for stuck threads, just exit."
        executor.shutdown(wait=False, cancel_futures=True)

    # --- CONSTRUCT PAYLOAD (Fallback Logic) ---
    try:
        # Construct Correlation Matrix
        if has_real_data and not market_data["history"].empty:
            try:
                hist = market_data["history"]
                col = 'adjclose' if 'adjclose' in hist.columns else 'close'
                closes = hist.reset_index().pivot(index='date', columns='symbol', values=col)
                log_ret = np.log(closes / closes.shift(1))
                corr_matrix = log_ret.corr().fillna(0).values.tolist()
            except Exception:
                pass # Keep identity matrix
        else:
             closes = pd.DataFrame()

        # Construct Asset Data
        for ticker in tickers:
            # Defaults (Mock Data)
            price = 150.0
            sigma = 0.25
            mu = 0.05
            narrative = "Simulation Mode (Data Unavailable)"

            if has_real_data:
                try:
                    # Price
                    p_obj = market_data["prices"].get(ticker)
                    if isinstance(p_obj, dict):
                        price = p_obj.get('regularMarketPrice', price)
                    elif ticker in closes:
                        price = closes[ticker].iloc[-1]
                    
                    # Volatility
                    if ticker in closes:
                        series = closes[ticker]
                        rets = np.log(series / series.shift(1))
                        sigma = float(rets.std() * (252 ** 0.5))
                        mu = float(rets.mean() * 252)
                except:
                    pass # Use defaults

            # Sanitize NaNs
            if np.isnan(sigma): sigma = 0.25
            if np.isnan(mu): mu = 0.05

            # Add Sentiment (if we got any before timeout)
            drift, reason = sentiment_map.get(ticker, (0.0, ""))
            if reason and has_real_data:
                narrative = reason

            results[ticker] = {
                "price": float(price),
                "mu": mu + drift,
                "sigma": sigma,
                "narrative": narrative
            }
            
    except Exception as e:
        print(f"Construction Error: {e}")
        # Ultimate Panic Fallback
        for ticker in tickers:
            results[ticker] = {"price": 100.0, "mu": 0.05, "sigma": 0.2, "narrative": "System Recovery"}

    return results, corr_matrix

# --- 2. THE DAILY JOB (HTTP Trigger) ---
@https_fn.on_request()
def generate_daily_market(req: https_fn.Request) -> https_fn.Response:
    # ... (Same as your existing code)
    print("Generating daily market assets...")
    
    candidate_pool = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 
        'NVDA', 'AMD', 'NFLX', 'META', 'SPY',
        'COIN', 'PLTR', 'GME', 'HOOD', 'UBER'
    ]
    
    assets_payload = []
    
    try:
        yq = Ticker(candidate_pool)
        prices = yq.price
        hist = yq.history(period='1mo', interval='1d')
        
        for ticker in candidate_pool:
            try:
                if ticker not in prices or not isinstance(prices[ticker], dict):
                    continue
                    
                price = prices[ticker].get('regularMarketPrice', 0.0)
                if price == 0.0: continue

                vol = 0.2 
                try:
                    t_data = hist.xs(ticker) 
                    if len(t_data) > 2:
                        col = 'adjclose' if 'adjclose' in t_data else 'close'
                        log_ret = np.log(t_data[col] / t_data[col].shift(1))
                        vol = float(log_ret.std() * (252 ** 0.5))
                except:
                    pass

                assets_payload.append({
                    "symbol": ticker,
                    "price": float(price),
                    "volatility": vol if not np.isnan(vol) else 0.2
                })
                
            except Exception as e:
                continue
                
    except Exception as e:
        for ticker in candidate_pool[:5]:
             assets_payload.append({"symbol": ticker, "price": 150.0, "volatility": 0.3})

    et_now = datetime.now(ZoneInfo("America/New_York"))
    
    daily_data = {
        "date": et_now.strftime("%Y-%m-%d"),
        "assets": assets_payload,
        "lastUpdated": et_now.isoformat(),
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    
    db.collection('config').document('dailyAssets').set(daily_data)
    return https_fn.Response(json.dumps({"success": True, "count": len(assets_payload)}), status=200)

# --- 3. THE GAME INITIALIZER ---
@https_fn.on_request(
    cors=options.CorsOptions(
        cors_origins="*", 
        cors_methods=["GET", "POST"]
    ),
    timeout_sec=300, # <--- OPTIONAL: Explicitly increase timeout
    memory=512       # <--- OPTIONAL: Increase memory if threads are heavy
)
def start_simulation(req: https_fn.Request) -> https_fn.Response:
    if req.method == 'OPTIONS':
        return https_fn.Response("", status=204)

    try:
        data = req.get_json()
        selected_tickers = data.get('selectedTickers', [])
        
        if not selected_tickers:
            return https_fn.Response(json.dumps({"error": "No tickers"}), status=400)

        # Call the optimized function
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