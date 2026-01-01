// Portfolio data structure
let portfolio = [];
let originalPortfolio = null; // Backup of original portfolio before changes
let replacedStocks = new Map(); // Track individual stock replacements: newSymbol -> originalStock
let chartInstance = null;
let esgDataMap = new Map(); // Store ESG data from CSV
let benchmarks = {
    sp500Average: 0,
    greenFundsAverage: 0
};
let suggestionFilter = 'total'; // 'total', 'environment', 'social', 'governance'

// Use Yahoo Finance for validation (no API key needed)
const USE_API_VALIDATION = true;

// Color palette for pie chart - High contrast green and natural themes
const colorPalette = [
    '#2d6a4f', '#a7c957', '#1b4332', '#06d6a0',
    '#40916c', '#6a994e', '#005f73', '#52b788',
    '#8bc34a', '#1b9aaa', '#2e7d32', '#4db6ac',
    '#66bb6a', '#00695c', '#81c784', '#00796b',
    '#388e3c', '#26a69a', '#43a047', '#009688'
];

// DOM Elements
const stockSymbolInput = document.getElementById('stock-symbol');
const stockValueInput = document.getElementById('stock-value');
const addStockBtn = document.getElementById('add-stock-btn');
const holdingsContainer = document.getElementById('holdings-container');
const totalValueEl = document.getElementById('total-value');
const holdingsCountEl = document.getElementById('holdings-count');
const chartCanvas = document.getElementById('portfolio-chart');
const chartLegend = document.getElementById('chart-legend');

// Proper CSV parser that handles quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

// Load ESG data from CSV on page load
async function loadESGData() {
    try {
        const response = await fetch('../esgdata.csv');
        const csvText = await response.text();

        // Parse CSV
        const lines = csvText.split('\n');
        const headers = parseCSVLine(lines[0]);

        // Find column indices
        const tickerIdx = headers.indexOf('ticker');
        const nameIdx = headers.indexOf('name');
        const industryIdx = headers.indexOf('industry');
        const totalScoreIdx = headers.indexOf('total_score');
        const envScoreIdx = headers.indexOf('environment_score');
        const socialScoreIdx = headers.indexOf('social_score');
        const govScoreIdx = headers.indexOf('governance_score');
        const totalGradeIdx = headers.indexOf('total_grade');
        const totalLevelIdx = headers.indexOf('total_level');

        console.log('Column indices:', {
            ticker: tickerIdx,
            totalScore: totalScoreIdx,
            envScore: envScoreIdx,
            socialScore: socialScoreIdx,
            govScore: govScoreIdx,
            grade: totalGradeIdx,
            level: totalLevelIdx
        });

        // Parse each row
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const cols = parseCSVLine(lines[i]);
            const ticker = cols[tickerIdx]?.trim().toUpperCase();

            if (ticker) {
                esgDataMap.set(ticker, {
                    name: cols[nameIdx]?.trim() || ticker,
                    industry: cols[industryIdx]?.trim() || 'N/A',
                    totalScore: cols[totalScoreIdx]?.trim() || 'N/A',
                    environmentScore: cols[envScoreIdx]?.trim() || 'N/A',
                    socialScore: cols[socialScoreIdx]?.trim() || 'N/A',
                    governanceScore: cols[govScoreIdx]?.trim() || 'N/A',
                    grade: cols[totalGradeIdx]?.trim() || 'N/A',
                    level: cols[totalLevelIdx]?.trim() || 'N/A'
                });
            }
        }

        console.log(`Loaded ESG data for ${esgDataMap.size} stocks`);
        console.log('Sample stocks:', Array.from(esgDataMap.keys()).slice(0, 10));

        // Calculate benchmarks
        calculateBenchmarks();
    } catch (error) {
        console.error('Error loading ESG data:', error);
    }
}

// Calculate S&P 500 average and Green Funds average
function calculateBenchmarks() {
    let totalScore = 0;
    let count = 0;
    let greenScores = [];

    for (const [ticker, data] of esgDataMap.entries()) {
        const score = parseFloat(data.totalScore);
        if (!isNaN(score) && score > 0) {
            totalScore += score;
            count++;

            // Green funds: A or BBB grade
            if (data.grade === 'A' || data.grade === 'AAA' || data.grade === 'AA' || data.grade === 'BBB') {
                greenScores.push(score);
            }
        }
    }

    benchmarks.sp500Average = count > 0 ? (totalScore / count).toFixed(1) : 0;
    benchmarks.greenFundsAverage = greenScores.length > 0
        ? (greenScores.reduce((a, b) => a + b, 0) / greenScores.length).toFixed(1)
        : 0;

    console.log('Benchmarks calculated:', benchmarks);
}

// Event Listeners
addStockBtn.addEventListener('click', addStock);
stockSymbolInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});
stockValueInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});

// Load ESG data when page loads
loadESGData();


// Fetch ESG score and company name from local CSV data
function fetchESGScore(symbol) {
    const upperSymbol = symbol.toUpperCase();
    const esgData = esgDataMap.get(upperSymbol);

    if (esgData && esgData.totalScore !== 'N/A') {
        return {
            name: esgData.name,
            industry: esgData.industry,
            totalScore: esgData.totalScore,
            environmentScore: esgData.environmentScore,
            socialScore: esgData.socialScore,
            governanceScore: esgData.governanceScore,
            grade: esgData.grade,
            level: esgData.level
        };
    }

    return null;
}

// Get company name from ESG data or return ticker
function getCompanyName(symbol) {
    const upperSymbol = symbol.toUpperCase();
    const esgData = esgDataMap.get(upperSymbol);
    return esgData?.name || symbol;
}

// Validate stock symbol using Yahoo Finance
async function validateStock(symbol) {
    if (!USE_API_VALIDATION) {
        return true;
    }

    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;

        const response = await fetch(proxyUrl);
        const proxyData = await response.json();

        if (proxyData.contents) {
            const data = JSON.parse(proxyData.contents);
            // Valid if we get chart data back
            return data?.chart?.result?.[0]?.meta?.regularMarketPrice !== undefined;
        }
        return false;
    } catch (error) {
        console.error('Stock validation error:', error);
        return true; // Allow adding if validation fails
    }
}

// Add stock to portfolio
async function addStock() {
    const symbol = stockSymbolInput.value.trim().toUpperCase();
    const value = parseFloat(stockValueInput.value);

    // Validation
    if (!symbol) {
        alert('Please enter a stock symbol');
        stockSymbolInput.focus();
        return;
    }

    if (!value || value <= 0) {
        alert('Please enter a valid dollar amount');
        stockValueInput.focus();
        return;
    }

    // Validate stock exists (if API is configured)
    if (USE_API_VALIDATION) {
        addStockBtn.disabled = true;
        addStockBtn.textContent = 'Validating...';

        const isValid = await validateStock(symbol);

        addStockBtn.disabled = false;
        addStockBtn.textContent = 'Add Stock';

        if (!isValid) {
            alert(`Stock symbol "${symbol}" not found. Please check the symbol and try again.`);
            stockSymbolInput.focus();
            return;
        }
    }

    // Fetch ESG score from local data
    const esgData = fetchESGScore(symbol);
    const companyName = getCompanyName(symbol);

    // Check if stock already exists
    const existingStock = portfolio.find(stock => stock.symbol === symbol);
    if (existingStock) {
        // Automatically add to existing value without confirmation
        existingStock.value += value;
        // Update ESG data if fetched
        if (esgData) {
            existingStock.esg = esgData;
            existingStock.name = companyName;
        }
    } else {
        // Add new stock
        portfolio.push({
            symbol: symbol,
            name: companyName,
            value: value,
            id: Date.now(),
            esg: esgData
        });
    }

    // Clear inputs
    stockSymbolInput.value = '';
    stockValueInput.value = '';
    stockSymbolInput.focus();

    // Update UI
    updatePortfolioDisplay();
}

// Remove stock from portfolio
function removeStock(id) {
    portfolio = portfolio.filter(s => s.id !== id);
    updatePortfolioDisplay();
}

// Update the portfolio display
function updatePortfolioDisplay() {
    // Clear container
    holdingsContainer.innerHTML = '';

    if (portfolio.length === 0) {
        holdingsContainer.innerHTML = '<p class="empty-state">No stocks added yet. Add your first stock above!</p>';
        totalValueEl.textContent = '$0.00';
        holdingsCountEl.textContent = '0';
        return;
    }

    // Sort by value (descending)
    const sortedPortfolio = [...portfolio].sort((a, b) => b.value - a.value);

    // Calculate total
    const total = portfolio.reduce((sum, stock) => sum + stock.value, 0);

    // Create holdings items
    sortedPortfolio.forEach((stock, index) => {
        const percentage = (stock.value / total * 100).toFixed(2);
        const color = colorPalette[index % colorPalette.length];

        // ESG display
        const esgDisplay = stock.esg
            ? `<span class="esg-score" title="ESG Score: ${stock.esg.grade} (${stock.esg.level})">ESG: ${stock.esg.totalScore}</span>`
            : `<span class="esg-score esg-none">ESG: None</span>`;

        const displayName = stock.name ? `${stock.name} (${stock.symbol})` : stock.symbol;

        const holdingItem = document.createElement('div');
        holdingItem.className = 'holding-item';
        holdingItem.style.borderLeftColor = color;
        holdingItem.innerHTML = `
            <div class="holding-info">
                <div class="holding-symbol">${displayName} ${esgDisplay}</div>
                <div class="holding-value">$${stock.value.toFixed(2)} (${percentage}%)</div>
            </div>
            <button class="btn btn-remove" onclick="removeStock(${stock.id})">Remove</button>
        `;

        holdingsContainer.appendChild(holdingItem);
    });

    // Update summary
    totalValueEl.textContent = `$${total.toFixed(2)}`;
    holdingsCountEl.textContent = portfolio.length;

    // Calculate and display weighted average ESG scores
    updatePortfolioESG(total);

    // Auto-generate chart
    generateChart();

    // Auto-generate suggestions
    suggestAlternatives();

    // Generate performance chart
    generatePerformanceChart();
}

// Calculate weighted average ESG scores for the portfolio
function updatePortfolioESG(totalValue) {
    const esgSummaryEl = document.getElementById('esg-summary');

    if (!esgSummaryEl) return;

    // Filter stocks that have ESG data
    const stocksWithESG = portfolio.filter(stock => stock.esg);

    if (stocksWithESG.length === 0) {
        esgSummaryEl.innerHTML = '<p class="empty-state">Add stocks with ESG data to see portfolio ESG metrics</p>';
        return;
    }

    let weightedEnv = 0;
    let weightedSocial = 0;
    let weightedGov = 0;
    let weightedTotal = 0;
    let totalWeightedValue = 0;

    stocksWithESG.forEach(stock => {
        const weight = stock.value / totalValue;
        const envScore = parseFloat(stock.esg.environmentScore) || 0;
        const socialScore = parseFloat(stock.esg.socialScore) || 0;
        const govScore = parseFloat(stock.esg.governanceScore) || 0;
        const totalScore = parseFloat(stock.esg.totalScore) || 0;

        weightedEnv += envScore * weight;
        weightedSocial += socialScore * weight;
        weightedGov += govScore * weight;
        weightedTotal += totalScore * weight;
        totalWeightedValue += stock.value;
    });

    const coveragePercent = ((totalWeightedValue / totalValue) * 100).toFixed(1);

    // Calculate performance vs benchmarks
    const vsSP500 = (weightedTotal - parseFloat(benchmarks.sp500Average)).toFixed(1);
    const vsGreen = (weightedTotal - parseFloat(benchmarks.greenFundsAverage)).toFixed(1);

    const revertButton = originalPortfolio
        ? '<button class="btn btn-danger" onclick="revertToOriginal()" style="margin-top: 15px; width: 100%;">↩ Revert to Original Portfolio</button>'
        : '';

    esgSummaryEl.innerHTML = `
        <div class="sort-by-section">
            <span class="sort-label">Sort by:</span>
            <div class="filter-buttons">
                <button class="filter-btn ${suggestionFilter === 'total' ? 'active' : ''}" onclick="setSuggestionFilter('total')">Total</button>
                <button class="filter-btn ${suggestionFilter === 'environment' ? 'active' : ''}" onclick="setSuggestionFilter('environment')">E</button>
                <button class="filter-btn ${suggestionFilter === 'social' ? 'active' : ''}" onclick="setSuggestionFilter('social')">S</button>
                <button class="filter-btn ${suggestionFilter === 'governance' ? 'active' : ''}" onclick="setSuggestionFilter('governance')">G</button>
            </div>
        </div>
        <div style="margin-bottom: 10px;">
            <a href="https://www.investopedia.com/terms/e/environmental-social-and-governance-esg-criteria.asp"
               target="_blank"
               style="font-size: 0.85rem; color: #2d6a4f; text-decoration: none;">
                What is ESG? ℹ️
            </a>
        </div>
        <h3>Portfolio ESG Metrics</h3>
        <div class="esg-metrics">
            <div class="esg-metric">
                <span class="metric-label">Environment:</span>
                <span class="metric-value">${weightedEnv.toFixed(1)}</span>
            </div>
            <div class="esg-metric">
                <span class="metric-label">Social:</span>
                <span class="metric-value">${weightedSocial.toFixed(1)}</span>
            </div>
            <div class="esg-metric">
                <span class="metric-label">Governance:</span>
                <span class="metric-value">${weightedGov.toFixed(1)}</span>
            </div>
            <div class="esg-metric total">
                <span class="metric-label">Total ESG Score:</span>
                <span class="metric-value">${weightedTotal.toFixed(1)}</span>
            </div>
            <div class="esg-coverage">
                <small>${coveragePercent}% of portfolio has ESG data</small>
            </div>
        </div>
        <div class="benchmark-comparison">
            <h4>Benchmark Comparison</h4>
            <div class="benchmark-item">
                <span class="benchmark-label">S&P 500 Average:</span>
                <span class="benchmark-value">${benchmarks.sp500Average}</span>
                <span class="benchmark-diff ${vsSP500 >= 0 ? 'positive' : 'negative'}">
                    ${vsSP500 >= 0 ? '+' : ''}${vsSP500}
                </span>
            </div>
            <div class="benchmark-item">
                <span class="benchmark-label">Green Funds Average:</span>
                <span class="benchmark-value">${benchmarks.greenFundsAverage}</span>
                <span class="benchmark-diff ${vsGreen >= 0 ? 'positive' : 'negative'}">
                    ${vsGreen >= 0 ? '+' : ''}${vsGreen}
                </span>
            </div>
        </div>
        ${revertButton}
    `;
}

// Generate pie chart
function generateChart() {
    if (portfolio.length === 0) {
        // Destroy chart if portfolio is empty
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        chartLegend.innerHTML = '';
        return;
    }

    // Calculate total and percentages
    const total = portfolio.reduce((sum, stock) => sum + stock.value, 0);
    const sortedPortfolio = [...portfolio].sort((a, b) => b.value - a.value);

    // Prepare chart data
    const labels = sortedPortfolio.map(stock => stock.symbol);
    const data = sortedPortfolio.map(stock => stock.value);
    const percentages = sortedPortfolio.map(stock =>
        ((stock.value / total) * 100).toFixed(2)
    );
    const colors = sortedPortfolio.map((_, index) =>
        colorPalette[index % colorPalette.length]
    );

    // Destroy existing chart if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Create labels with company names
    const chartLabels = sortedPortfolio.map(stock => stock.name || stock.symbol);

    // Create new chart with datalabels
    const ctx = chartCanvas.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chartLabels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const stock = sortedPortfolio[context.dataIndex];
                            const value = context.parsed || 0;
                            const percentage = percentages[context.dataIndex];
                            return [
                                `${stock.name || stock.symbol}`,
                                `Value: $${value.toFixed(2)}`,
                                `Percentage: ${percentage}%`
                            ];
                        }
                    }
                }
            }
        }
    });

    // Generate custom legend
    generateLegend(sortedPortfolio, percentages, colors);
}

// Generate custom legend
function generateLegend(sortedPortfolio, percentages, colors) {
    chartLegend.innerHTML = '';

    sortedPortfolio.forEach((stock, index) => {
        const esgBadge = stock.esg
            ? `<span class="esg-badge esg-${getESGRatingFromGrade(stock.esg.grade)}">${stock.esg.grade}</span>`
            : `<span class="esg-badge esg-none">No ESG</span>`;

        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-color" style="background-color: ${colors[index]}"></div>
            <div class="legend-text">
                <span class="legend-symbol">${stock.symbol}</span>
                ${esgBadge}
                <span class="legend-percentage">${percentages[index]}%</span>
            </div>
        `;
        chartLegend.appendChild(legendItem);
    });
}

// Get ESG rating class based on grade
function getESGRatingFromGrade(grade) {
    if (grade === 'A' || grade === 'AAA' || grade === 'AA') return 'excellent';
    if (grade === 'BBB' || grade === 'AA-') return 'good';
    if (grade === 'BB' || grade === 'BB+' || grade === 'BB-') return 'average';
    return 'poor';
}

// Change suggestion filter
function setSuggestionFilter(filter) {
    suggestionFilter = filter;

    // Update ESG section to refresh filter buttons
    const total = portfolio.reduce((sum, stock) => sum + stock.value, 0);
    updatePortfolioESG(total);

    // Update suggestions
    suggestAlternatives();
}

// Suggest better ESG alternatives from same industry
function suggestAlternatives() {
    const suggestionsEl = document.getElementById('suggestions-container');

    if (!suggestionsEl) return;

    if (portfolio.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
    }

    const stocksWithESG = portfolio.filter(stock => stock.esg && stock.esg.industry !== 'N/A');

    if (stocksWithESG.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
    }

    let suggestionsHTML = `
        <div class="suggestions-title">ESG Alternatives</div>
        <div class="suggestions-grid">
    `;

    stocksWithESG.forEach(stock => {
        // Check if this stock is a replacement - if so, show alternatives for the ORIGINAL stock
        // Priority: use stock.originalSymbol if it exists, otherwise check replacedStocks Map, otherwise use current stock
        let wasReplaced = false;
        let originalStock = stock;
        let displaySymbol = stock.symbol;

        if (stock.originalSymbol) {
            // This stock has an originalSymbol property, meaning it's a replacement
            wasReplaced = true;
            originalStock = replacedStocks.get(stock.symbol) || stock;
            displaySymbol = stock.originalSymbol;
        } else if (replacedStocks.has(stock.symbol)) {
            // This stock's symbol is a key in replacedStocks, meaning it's a replacement
            wasReplaced = true;
            originalStock = replacedStocks.get(stock.symbol);
            displaySymbol = originalStock.symbol;
        }

        const searchStock = originalStock.esg || stock.esg;

        // Get current score based on filter
        let currentScore, scoreField;
        if (suggestionFilter === 'environment') {
            currentScore = parseFloat(searchStock.environmentScore);
            scoreField = 'environmentScore';
        } else if (suggestionFilter === 'social') {
            currentScore = parseFloat(searchStock.socialScore);
            scoreField = 'socialScore';
        } else if (suggestionFilter === 'governance') {
            currentScore = parseFloat(searchStock.governanceScore);
            scoreField = 'governanceScore';
        } else {
            currentScore = parseFloat(searchStock.totalScore);
            scoreField = 'totalScore';
        }

        const industry = searchStock.industry;

        // Find better alternatives in same industry
        const alternatives = [];
        for (const [ticker, data] of esgDataMap.entries()) {
            if (ticker === displaySymbol) continue;
            if (ticker === stock.symbol) continue; // Also skip current replacement
            if (data.industry !== industry) continue;
            if (data[scoreField] === 'N/A') continue;

            const altScore = parseFloat(data[scoreField]);
            if (altScore > currentScore) {
                alternatives.push({
                    ticker: ticker,
                    name: data.name,
                    score: data[scoreField],
                    totalScore: data.totalScore,
                    grade: data.grade,
                    improvement: altScore - currentScore
                });
            }
        }

        // Sort by improvement and take top 3
        alternatives.sort((a, b) => b.improvement - a.improvement);
        const topAlternatives = alternatives.slice(0, 3);

        // Always show the column if there are alternatives OR if it was replaced
        if (topAlternatives.length > 0 || wasReplaced) {
            const displayScore = suggestionFilter === 'total' ? searchStock.totalScore :
                                 suggestionFilter === 'environment' ? searchStock.environmentScore :
                                 suggestionFilter === 'social' ? searchStock.socialScore :
                                 searchStock.governanceScore;

            const revertBtn = wasReplaced
                ? `<button class="btn-revert-small" onclick="revertStock('${stock.symbol}')" title="Revert">↩</button>`
                : '';

            suggestionsHTML += `
                <div class="suggestion-group">
                    <div class="replace-stock ${wasReplaced ? 'was-replaced' : ''}">
                        <strong>${displaySymbol}</strong>
                        <span class="score-num">${displayScore}</span>
                        ${revertBtn}
                    </div>
            `;

            topAlternatives.forEach(alt => {
                const altData = esgDataMap.get(alt.ticker);
                const companyInfo = altData ? `${altData.name} - ${altData.industry}` : alt.name;
                suggestionsHTML += `
                    <div class="alt-item">
                        <span class="alt-ticker"
                              data-ticker="${alt.ticker}"
                              data-name="${altData?.name || alt.ticker}"
                              data-industry="${altData?.industry || 'N/A'}"
                              onmouseenter="showCompanyTooltip(event, '${alt.ticker}')"
                              onmouseleave="hideCompanyTooltip()">
                            ${alt.ticker}
                        </span>
                        <span class="score-num">${alt.score}</span>
                        <button class="btn-compact" onclick="addToProposal('${displaySymbol}', '${alt.ticker}', ${stock.value})">↻</button>
                    </div>
                `;
            });

            suggestionsHTML += `</div>`;
        }
    });

    suggestionsHTML += '</div>';
    suggestionsHTML += '<div class="suggestions-hint">Hover over companies to read description</div>';
    suggestionsEl.innerHTML = suggestionsHTML;
    suggestionsEl.style.display = 'block';
}

// Add suggestion to proposed portfolio - directly modifies the main portfolio
function addToProposal(replaceSymbol, newSymbol, value) {
    // Backup original portfolio on first change
    if (!originalPortfolio) {
        originalPortfolio = JSON.parse(JSON.stringify(portfolio));
    }

    // Find the stock to replace - it might be the current replacement if already replaced
    let index = portfolio.findIndex(s => s.symbol === replaceSymbol);

    // If not found directly, check if replaceSymbol is an original that was already replaced
    if (index === -1) {
        // Look for the current replacement of this original stock
        for (const [currentSymbol, origStock] of replacedStocks.entries()) {
            if (origStock.symbol === replaceSymbol) {
                index = portfolio.findIndex(s => s.symbol === currentSymbol);
                break;
            }
        }
    }

    if (index !== -1) {
        const currentStock = portfolio[index];

        // Get the original stock (either from replacedStocks or the current stock)
        let originalStock;
        if (replacedStocks.has(currentStock.symbol)) {
            // This stock was already replaced, keep the original
            originalStock = replacedStocks.get(currentStock.symbol);
            // Remove the old replacement from the map
            replacedStocks.delete(currentStock.symbol);
        } else {
            // First time replacing this stock
            originalStock = JSON.parse(JSON.stringify(currentStock));
        }

        const esgData = fetchESGScore(newSymbol);
        const companyName = getCompanyName(newSymbol);

        // Replace the stock
        portfolio[index] = {
            symbol: newSymbol,
            name: companyName,
            value: value,
            esg: esgData,
            id: portfolio[index].id,
            originalSymbol: originalStock.symbol  // Track the original symbol directly on the stock object
        };

        // Track this individual replacement with the ORIGINAL stock
        replacedStocks.set(newSymbol, originalStock);

        // Update the display
        updatePortfolioDisplay();
    }
}

// Revert a single stock to its original
function revertStock(currentSymbol) {
    const originalStock = replacedStocks.get(currentSymbol);
    if (originalStock) {
        const index = portfolio.findIndex(s => s.symbol === currentSymbol);
        if (index !== -1) {
            // Restore the original stock (which doesn't have originalSymbol property)
            portfolio[index] = originalStock;
            replacedStocks.delete(currentSymbol);

            // If no more replaced stocks, clear the original portfolio backup
            if (replacedStocks.size === 0) {
                originalPortfolio = null;
            }

            updatePortfolioDisplay();
        }
    }
}

// Revert to original portfolio
function revertToOriginal() {
    if (originalPortfolio) {
        portfolio = JSON.parse(JSON.stringify(originalPortfolio));
        originalPortfolio = null;
        proposedChanges = [];
        updatePortfolioDisplay();
    }
}

// Company tooltip functions
let tooltipCache = new Map();
let tooltipElement = null;
let tooltipTimeout = null;

function createTooltipElement() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'company-tooltip';
        tooltipElement.style.display = 'none';

        // Keep tooltip open when hovering over it
        tooltipElement.addEventListener('mouseenter', () => {
            clearTimeout(tooltipTimeout);
        });

        tooltipElement.addEventListener('mouseleave', () => {
            hideCompanyTooltip();
        });

        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

function showCompanyTooltip(event, ticker) {
    clearTimeout(tooltipTimeout);

    const tooltip = createTooltipElement();
    const target = event.target;
    const rect = target.getBoundingClientRect();

    // Get basic info from ESG data
    const companyData = esgDataMap.get(ticker);
    const name = companyData?.name || ticker;
    const industry = companyData?.industry || 'N/A';

    // Yahoo Finance link
    const yahooLink = `https://finance.yahoo.com/quote/${ticker}`;

    // Show basic info immediately
    tooltip.innerHTML = `
        <div class="tooltip-header">
            <strong>${ticker}</strong>
            <a href="${yahooLink}" target="_blank" class="yahoo-link">Yahoo Finance Link</a>
        </div>
        <div class="tooltip-body">
            <div><strong>${name}</strong></div>
            <div class="tooltip-industry">${industry}</div>
            <div class="tooltip-loading">Loading description...</div>
        </div>
    `;

    // Position tooltip
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    tooltip.style.display = 'block';

    // Fetch company description from Wikipedia
    fetchCompanyDescription(ticker, name, tooltip);
}

async function fetchCompanyDescription(ticker, companyName, tooltip) {
    // Check cache first
    if (tooltipCache.has(ticker)) {
        updateTooltipWithDescription(tooltip, tooltipCache.get(ticker));
        return;
    }

    console.log(`Fetching description for ${ticker} (${companyName})`);

    // Try Wikipedia directly first (more reliable)
    const wikiSuccess = await fetchFromWikipedia(ticker, companyName, tooltip);
    if (wikiSuccess) return;

    // If Wikipedia fails, try Yahoo Finance with CORS proxy
    try {
        const yahooUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;

        console.log(`Trying Yahoo Finance for ${ticker}`);
        const response = await fetch(proxyUrl, { timeout: 5000 });
        const proxyData = await response.json();

        if (proxyData.contents) {
            const data = JSON.parse(proxyData.contents);

            if (data?.quoteSummary?.result?.[0]?.assetProfile?.longBusinessSummary) {
                const summary = data.quoteSummary.result[0].assetProfile.longBusinessSummary;
                console.log(`Got Yahoo Finance summary for ${ticker}`);
                tooltipCache.set(ticker, summary);
                updateTooltipWithDescription(tooltip, summary);
                return;
            }
        }
    } catch (error) {
        console.error(`Yahoo Finance error for ${ticker}:`, error);
    }

    // If both fail, show message
    const loadingEl = tooltip.querySelector('.tooltip-loading');
    if (loadingEl) {
        loadingEl.textContent = 'Description not available';
    }
}

async function fetchFromWikipedia(ticker, companyName, tooltip) {
    // Strip common company suffixes
    const baseName = companyName
        .replace(/\s+(Inc\.?|LLC\.?|Ltd\.?|Limited|Corporation|Corp\.?|Company|Co\.?)$/i, '')
        .trim();

    const attempts = [
        baseName,                    // ServiceNow
        companyName,                 // ServiceNow Inc (original)
        `${baseName} Inc.`,         // ServiceNow Inc.
        `${baseName} Corporation`,   // ServiceNow Corporation
        `${baseName} (company)`      // ServiceNow (company)
    ];

    for (const attempt of attempts) {
        try {
            console.log(`Trying Wikipedia for: ${attempt}`);
            const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(attempt)}`;
            const response = await fetch(searchUrl);
            const data = await response.json();

            if (data && data.extract && !data.extract.includes('may refer to')) {
                console.log(`✓ Found Wikipedia description for ${ticker} using: ${attempt}`);
                tooltipCache.set(ticker, data.extract);
                updateTooltipWithDescription(tooltip, data.extract);
                return true;
            }
        } catch (error) {
            console.log(`✗ Wikipedia attempt failed for ${attempt}`);
        }
    }

    console.log(`No Wikipedia description found for ${ticker}`);
    return false;
}

function updateTooltipWithDescription(tooltip, description) {
    const loadingEl = tooltip.querySelector('.tooltip-loading');
    if (loadingEl && description) {
        // Show first 250 characters of description
        const shortDesc = description.length > 250
            ? description.substring(0, 250) + '...'
            : description;
        loadingEl.innerHTML = `<div class="tooltip-description">${shortDesc}</div>`;
    } else if (loadingEl) {
        loadingEl.textContent = '';
    }
}

function hideCompanyTooltip() {
    tooltipTimeout = setTimeout(() => {
        if (tooltipElement) {
            tooltipElement.style.display = 'none';
        }
    }, 200);
}

// Portfolio performance chart
let performanceChartInstance = null;

async function generatePerformanceChart() {
    const performanceSection = document.getElementById('performance-section');
    const performanceCanvas = document.getElementById('performance-chart');
    const loadingEl = document.querySelector('.performance-loading');

    if (portfolio.length === 0) {
        performanceSection.style.display = 'none';
        return;
    }

    performanceSection.style.display = 'block';
    loadingEl.style.display = 'block';

    try {
        // Fetch 5-year historical data for all stocks
        const historicalData = await fetchPortfolioHistory();

        if (!historicalData || historicalData.labels.length === 0) {
            loadingEl.textContent = 'Historical data unavailable';
            return;
        }

        loadingEl.style.display = 'none';

        // Destroy existing chart
        if (performanceChartInstance) {
            performanceChartInstance.destroy();
        }

        // Create performance chart
        const ctx = performanceCanvas.getContext('2d');
        performanceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historicalData.labels,
                datasets: [{
                    label: 'Portfolio Value ($)',
                    data: historicalData.values,
                    borderColor: '#2d6a4f',
                    backgroundColor: 'rgba(45, 106, 79, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error generating performance chart:', error);
        loadingEl.textContent = 'Error loading historical data';
    }
}

async function fetchPortfolioHistory() {
    const total = portfolio.reduce((sum, stock) => sum + stock.value, 0);
    const stockPromises = portfolio.map(stock => fetchStockHistory(stock.symbol, stock.value));

    const results = await Promise.all(stockPromises);
    const validResults = results.filter(r => r !== null);

    if (validResults.length === 0) {
        return null;
    }

    // Combine all stock histories into portfolio history
    const portfolioHistory = {};

    validResults.forEach(stockData => {
        stockData.history.forEach(point => {
            const date = point.date;
            if (!portfolioHistory[date]) {
                portfolioHistory[date] = 0;
            }
            portfolioHistory[date] += point.value;
        });
    });

    // Sort by date and format
    const sortedDates = Object.keys(portfolioHistory).sort();
    const labels = sortedDates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    });
    const values = sortedDates.map(date => portfolioHistory[date]);

    return { labels, values };
}

async function fetchStockHistory(ticker, currentValue, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5y&interval=1mo`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;

            const response = await fetch(proxyUrl);
            const proxyData = await response.json();

            if (!proxyData.contents) {
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const data = JSON.parse(proxyData.contents);
            const result = data?.chart?.result?.[0];

            if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const timestamps = result.timestamp;
            const closes = result.indicators.quote[0].close;

            // Get the most recent price (current price)
            const currentPrice = closes[closes.length - 1];

            if (!currentPrice || currentPrice === null) {
                return null;
            }

            // Calculate historical values based on price changes from current
            const history = timestamps.map((ts, i) => {
                if (closes[i] === null) return null;

                // Calculate what this stock position would have been worth historically
                // currentValue * (historicalPrice / currentPrice)
                const historicalValue = currentValue * (closes[i] / currentPrice);

                return {
                    date: new Date(ts * 1000).toISOString().split('T')[0],
                    value: historicalValue
                };
            }).filter(point => point !== null);

            return { ticker, history };
        } catch (error) {
            console.error(`Error fetching history for ${ticker} (attempt ${attempt + 1}/${retries + 1}):`, error);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
        }
    }
    return null;
}

// Initialize display
updatePortfolioDisplay();
