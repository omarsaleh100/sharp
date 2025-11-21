// Simple Box-Muller transform to generate Standard Normal Random Numbers
// (Math.random is uniform, we need a Bell Curve for stocks)
export const randomNormal = (mean = 0, stdev = 1) => {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return z * stdev + mean;
}

// The Geometric Brownian Motion Formula
// S_t = S_{t-1} * exp((mu - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z)
export const simulateStep = (price: number, mu: number, sigma: number, dt: number = 1/252) => {
    const drift = (mu - 0.5 * Math.pow(sigma, 2)) * dt;
    const shock = sigma * Math.sqrt(dt) * randomNormal();
    return price * Math.exp(drift + shock);
}

export const calculateSharpeRatio = (history: number[]) => {
    if (history.length < 2) return 0;

    // 1. Calculate Returns per Turn (Quarterly)
    const returns = [];
    for (let i = 1; i < history.length; i++) {
        const r = (history[i] - history[i-1]) / history[i-1];
        returns.push(r);
    }

    // 2. Mean Return
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // 3. Standard Deviation (Risk)
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Sharpe = (Rp - Rf) / Sigma. We assume Risk-Free Rate (Rf) is 0 for simplicity here.
    return (meanReturn / stdDev) * 2;
};