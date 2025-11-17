import yfinance as yf
import pandas as pd
import numpy as np
import random
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- 1. Initialize Flask App ---
app = Flask(__name__)
CORS(app)

# --- 2. Simulating speculative ecoomic events ---
ECONOMIC_EVENTS = [
    {"name": "Market Boom", "effect": "drift_boost", "message": "Breaking: A market-wide boom boosts investor confidence!"},
    {"name": "Tech Bubble Bursts", "effect": "tech_vol_spike", "message": "Breaking: The AI & Tech bubble has burst, causing massive volatility in tech stocks!"},
    {"name": "Fed Rate Hikes", "effect": "market_drift_down", "message": "Breaking: The Fed unexpectedly hikes interest rates, slowing market growth."},
    {"name": "Recession Fears", "effect": "market_vol_spike", "message": "Breaking: Recession fears grip the market, increasing volatility across all assets."}
]

# --- 2. Helper Function for Quant Calculations ---
def calculate_gbm_parameters(tickers):
    """
    Fetches historical data and calculates the parameters
    for a Geometric Brownian Motion (GBM) simulation.
    """
    print(f"Fetching data for: {tickers}")
    data = yf.download(tickers, period="3y", interval="1d")['Adj Close']
    if data.empty:
        raise ValueError("Could not download data. Check tickers.")
    
    log_returns = np.log(data / data.shift(1)).dropna()
    
    # Calculate GBM Parameters
    drift = (log_returns.mean() * 252).to_dict()
    volatility = (log_returns.std() * np.sqrt(252)).to_dict()
    
    # Calculate Covariance Matrix (needed for correlated simulation)
    # This is more direct than the correlation matrix for GBM
    covariance_matrix = log_returns.cov() * 252
    
    print(f"Calculated Drift (Annualized):\n{drift}")
    print(f"Calculated Volatility (Annualized):\n{volatility}")
    print(f"Calculated Covariance Matrix:\n{covariance_matrix}")

    parameters = {
        'drift': drift,
        'volatility': volatility,
        # We send the covariance matrix as a nested dict
        'covariance_matrix': covariance_matrix.to_dict('index')
    }
    return parameters

def run_gbm_turn(parameters, tickers, current_portfolio_value, allocations):
    """
    Runs one "turn" (one quarter) of the Geometric Brownian Motion model.
    This is "Action 1 (Simulate)" from your plan[cite: 49].
    """
    # Reconstruct DataFrames/Series from the dicts for easier math
    drift = pd.Series(parameters['drift'])
    cov_matrix = pd.DataFrame(parameters['covariance_matrix'])
    
    # Ensure order is consistent
    drift = drift[tickers]
    cov_matrix = cov_matrix.loc[tickers, tickers]

    # Time step (dt) is 1 "quarter", so 0.25 of a year
    dt = 0.25
    num_assets = len(tickers)
    
    # Generate correlated random numbers (Brownian motion)
    # This is the "stochastic" part
    cholesky_decomp = np.linalg.cholesky(cov_matrix)
    uncorrelated_randoms = np.random.normal(0, 1, num_assets)
    correlated_randoms = cholesky_decomp @ uncorrelated_randoms
    
    # Calculate the percentage change for each asset using the GBM formula
    asset_returns = (drift * dt) + (correlated_randoms * np.sqrt(dt))
    
    # --- Calculate New Portfolio Value ---
    # Get the value of each holding
    asset_values = {ticker: current_portfolio_value * allocations[ticker] for ticker in tickers}
    
    # Apply the simulated returns to each asset's value
    new_asset_values = {}
    total_new_value = 0
    for ticker in tickers:
        new_val = asset_values[ticker] * (1 + asset_returns[ticker])
        new_asset_values[ticker] = new_val
        total_new_value += new_val
        
    # Calculate the new, "drifted" allocation
    drifted_allocations = {ticker: val / total_new_value for ticker, val in new_asset_values.items()}
    
    return total_new_value, drifted_allocations

# --- 3. Define the /start_simulation Endpoint ---
@app.route('/start_simulation', methods=['POST'])
def start_simulation():
    """
    Endpoint 1: /start_simulation
    """
    try:
        data = request.get_json()
        tickers = data.get('assets')
        
        if not tickers or not (3 <= len(tickers) <= 5):
            return jsonify({"error": "Invalid input. Must select 3-5 assets."}), 400
        
        parameters = calculate_gbm_parameters(tickers)
        
        return jsonify({
            'turn': 0,
            'portfolioValue': 1000000,
            'simulationParameters': parameters,
            'message': "Simulation initialized."
        }), 200

    except Exception as e:
        print(f"Error in /start_simulation: {e}")
        return jsonify({"error": str(e)}), 500
        
@app.route('/next_turn', methods=['POST'])
def next_turn():
    """
    This is "Endpoint 2: /next_turn" from your plan.
    It runs one "step" of the simulation.
    """
    try:
        # Get all data from the client
        data = request.get_json()
        params = data.get('simulationParameters')
        allocations = data.get('allocation')
        current_value = data.get('portfolioValue')
        current_turn = data.get('turn')
        tickers = list(allocations.keys()) # Get tickers from allocation dict

        if not all([params, allocations, current_value is not None, current_turn is not None]):
            return jsonify({"error": "Missing simulation data"}), 400

        # --- Action 1: Simulate the next turn ---
        new_value, drifted_allocations = run_gbm_turn(
            params, tickers, current_value, allocations
        )
        
        event_data = None
        # --- Action 2: Check for a random event  ---
        if random.random() > 0.75: # 25% chance of an event
            event_data = random.choice(ECONOMIC_EVENTS)
            print(f"Turn {current_turn + 1}: Event triggered! {event_data['name']}")
            # Note: We are not applying the 'effect' yet, just reporting it.
            # This matches the MVP plan to just display the event text.

        # "Output: Return the new state" [cite: 53]
        return jsonify({
            'turn': current_turn + 1,
            'newValue': new_value,
            'driftedAllocation': drifted_allocations,
            'event': event_data  # Will be null if no event
        }), 200

    except Exception as e:
        print(f"Error in /next_turn: {e}")
        return jsonify({"error": str(e)}), 500

# --- 6. Run the App (for local testing) ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)