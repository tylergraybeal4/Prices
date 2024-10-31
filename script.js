class CryptoTracker {
    constructor() {
        this.apiUrl = 'https://api.coingecko.com/api/v3/coins/markets';
        this.cryptoContainer = document.getElementById('crypto-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error-message');
    }

    async fetchCryptoData() {
        try {
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';
            
            const response = await fetch(`${this.apiUrl}?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch cryptocurrency data');
            }
            
            const cryptos = await response.json();
            this.renderCryptos(cryptos);
        } catch (error) {
            this.handleError(error);
        } finally {
            this.loadingElement.style.display = 'none';
        }
    }

    handleError(error) {
        this.errorElement.innerHTML = `Error: ${error.message}`;
        console.error('Crypto Fetch Error:', error);
    }

    calculateColorIntensity(value, maxValue) {
        // Blue gradient based on market cap/volume
        const intensity = Math.min((value / maxValue) * 255, 255);
        return `rgb(${255 - intensity}, ${255 - intensity}, 255)`;
    }

    formatCurrency(value) {
        // Format large numbers with abbreviations
        if (value >= 1_000_000_000) {
            return `$${(value / 1_000_000_000).toFixed(2)}B`;
        } else if (value >= 1_000_000) {
            return `$${(value / 1_000_000).toFixed(2)}M`;
        } else {
            return `$${value.toLocaleString()}`;
        }
    }

    renderCryptos(cryptos) {
        // Clear previous content
        this.cryptoContainer.innerHTML = '';

        // Find max values for color scaling
        const maxMarketCap = Math.max(...cryptos.map(c => c.market_cap), 0);
        const maxVolume = Math.max(...cryptos.map(c => c.total_volume), 0);

        cryptos.forEach((crypto, index) => {
            // Create crypto card
            const cryptoCard = document.createElement('div');
            cryptoCard.className = 'crypto-card';

            // Market cap heat map color
            const marketCapColor = this.calculateColorIntensity(crypto.market_cap, maxMarketCap);

            // Price change color
            const priceChangeClass = crypto.price_change_percentage_24h > 0 
                ? 'price-change-positive' 
                : 'price-change-negative';

            cryptoCard.innerHTML = `
                <img src="${crypto.image}" alt="${crypto.name}" class="crypto-logo">
                <div class="crypto-details">
                    <h3>${crypto.name} (${crypto.symbol.toUpperCase()})</h3>
                    <p>Rank: ${index + 1}</p>
                    <p>Price: ${this.formatCurrency(crypto.current_price)}</p>
                    <p class="${priceChangeClass}">
                        24h Change: ${crypto.price_change_percentage_24h.toFixed(2)}%
                    </p>
                    <div class="market-cap-heatmap">
                        <div 
                            class="market-cap-bar" 
                            style="width: 100%; background-color: ${marketCapColor};"
                            title="Market Cap: ${this.formatCurrency(crypto.market_cap)}"
                        ></div>
                    </div>
                    <p>Market Cap: ${this.formatCurrency(crypto.market_cap)}</p>
                    <p>Volume: ${this.formatCurrency(crypto.total_volume)}</p>
                </div>
            `;

            this.cryptoContainer.appendChild(cryptoCard);
        });
    }

    startTracking() {
        // Initial fetch
        this.fetchCryptoData();

        // Refresh data every minute
        setInterval(() => {
            this.fetchCryptoData();
        }, 60000);
    }
}

// Initialize and start tracking when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const cryptoTracker = new CryptoTracker();
    cryptoTracker.startTracking();
});