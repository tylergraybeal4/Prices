class CryptoTracker {
    constructor() {
        this.apiUrls = {
            coingecko: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=',
            coinlore: 'https://api.coinlore.net/api/tickers/?start=0&limit=100'
        };
        this.cryptoContainer = document.getElementById('crypto-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error-message');
        this.errorNotification = document.getElementById('error-notification');
        this.currentDateTimeElement = document.getElementById('current-date-time');
        this.cryptos = [];
        this.selectedApi = 'coingecko';
        this.page = 1; // For pagination if needed

        // Back to Top button
        this.backToTopButton = document.getElementById('back-to-top');
        this.backToTopButton.addEventListener('click', () => this.scrollToTop());
        window.addEventListener('scroll', () => this.toggleBackToTopButton());

        document.getElementById('api-selector').addEventListener('change', (e) => {
            this.selectedApi = e.target.value;
            this.page = 1; // Reset page number on API change
            this.cryptos = []; // Clear existing cryptos
            this.fetchCryptoData();
        });

        document.getElementById('search-bar').addEventListener('input', (e) => {
            this.filterCryptos(e.target.value);
        });

        document.getElementById('load-more').addEventListener('click', () => {
            this.loadMore();
        });

        this.startTimeUpdater();
        this.fetchCryptoData();
    }

    toggleBackToTopButton() {
        this.backToTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateDateTime() {
        const now = new Date();
        this.currentDateTimeElement.innerText = `Current Date & Time: ${now.toLocaleString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        })}`;
    }

    startTimeUpdater() {
        setInterval(() => this.updateDateTime(), 1000);
    }

    async fetchCryptoData() {
        try {
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';
            const response = await fetch(this.apiUrls[this.selectedApi] + this.page);
            if (!response.ok) throw new Error('Failed to fetch cryptocurrency data');

            const data = await response.json();
            console.log("Fetched data:", data);
            const newCryptos = this.parseApiData(data);
            this.cryptos = this.cryptos.concat(newCryptos); // Accumulate new data
            this.renderCryptos(this.cryptos); // Render all cryptos
        } catch (error) {
            this.errorElement.innerText = error.message;
        } finally {
            this.loadingElement.style.display = 'none';
        }
    }

    loadMore() {
        this.page += 1; // Increment page number
        this.fetchCryptoData(); // Fetch next page
    }

    parseApiData(data) {
        try {
            switch (this.selectedApi) {
                case 'coingecko':
                    return data.map(crypto => ({
                        name: crypto.name,
                        symbol: crypto.symbol,
                        price: crypto.current_price,
                        marketCap: crypto.market_cap,
                        volume: crypto.total_volume,
                        logo: crypto.image,
                        priceChange: crypto.price_change_percentage_24h || 0 // Default to 0 if undefined
                    }));
                case 'coinlore':
                    return data.data.map(crypto => ({
                        name: crypto.name,
                        symbol: crypto.symbol,
                        price: parseFloat(crypto.price_usd),
                        marketCap: parseFloat(crypto.market_cap_usd),
                        volume: parseFloat(crypto.volume24),
                        logo: `https://www.coinlore.com/img/${crypto.nameid}.png`,
                        priceChange: parseFloat(crypto.percent_change_24h) || 0 // Default to 0 if undefined
                    }));
                default:
                    return [];
            }
        } catch (error) {
            console.error("Error parsing API data:", error);
            return [];
        }
    }

    renderCryptos(cryptos) {
        this.cryptoContainer.innerHTML = ''; // Clear previous results
        cryptos.forEach(crypto => {
            const card = document.createElement('div');
            card.className = 'crypto-card';
            card.innerHTML = `
                <img src="${crypto.logo}" alt="${crypto.name} logo" class="crypto-logo">
                <h2>${crypto.name} (${crypto.symbol})</h2>
                <p>Price: $${crypto.price.toFixed(2)}</p>
                <p>Market Cap: $${crypto.marketCap.toLocaleString()}</p>
                <p>Volume (24h): $${crypto.volume.toLocaleString()}</p>
                <p class="${crypto.priceChange >= 0 ? 'price-change-positive' : 'price-change-negative'}">
                    Change (24h): ${crypto.priceChange.toFixed(2)}%
                </p>
            `;
            this.cryptoContainer.appendChild(card);
        });
    }

    filterCryptos(searchTerm) {
        const filteredCryptos = this.cryptos.filter(crypto =>
            crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderCryptos(filteredCryptos);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CryptoTracker();
});
