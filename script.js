class CryptoTracker {
    constructor() {
        this.apiUrls = {
            coingecko: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=',
            coinlore: 'https://api.coinlore.net/api/tickers/?start=0&limit=100'
        };
        this.cryptoContainer = document.getElementById('crypto-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error-message');
        this.currentDateTimeElement = document.getElementById('current-date-time');
        this.cryptos = [];
        this.selectedApi = 'coingecko';
        this.page = 1;

        // Cache for search results
        this.searchCache = new Map();
        this.debounceTimeout = null;

        this.backToTopButton = document.getElementById('back-to-top');
        this.backToTopButton.addEventListener('click', () => this.scrollToTop());
        window.addEventListener('scroll', () => this.toggleBackToTopButton());

        document.getElementById('api-selector').addEventListener('change', (e) => {
            this.selectedApi = e.target.value;
            this.page = 1;
            this.cryptos = [];
            this.fetchCryptoData();
        });

        document.getElementById('search-bar').addEventListener('input', (e) => {
            clearTimeout(this.debounceTimeout);
            const query = e.target.value.trim();

            // Clear results if search is empty
            if (!query) {
                this.renderCryptos(this.cryptos);
                return;
            }

            // Add debounce to prevent too many API calls
            this.debounceTimeout = setTimeout(() => {
                this.searchCrypto(query);
            }, 300);
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
            const newCryptos = this.parseApiData(data);
            this.cryptos = this.cryptos.concat(newCryptos);
            this.renderCryptos(this.cryptos);
        } catch (error) {
            this.errorElement.innerText = error.message;
        } finally {
            this.loadingElement.style.display = 'none';
        }
    }

    loadMore() {
        this.page += 1;
        this.fetchCryptoData();
    }

    parseApiData(data) {
        try {
            switch (this.selectedApi) {
                case 'coingecko':
                    if (!Array.isArray(data)) return [];
                    return data.map(crypto => ({
                        name: crypto.name,
                        symbol: crypto.symbol.toUpperCase(),
                        price: crypto.current_price || 0,
                        marketCap: crypto.market_cap || 0,
                        volume: crypto.total_volume || 0,
                        logo: crypto.image || 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png',
                        priceChange: crypto.price_change_percentage_24h || 0
                    }));
                case 'coinlore':
                    const cryptos = Array.isArray(data) ? data : (data.data || []);
                    return cryptos.map(crypto => ({
                        name: crypto.name,
                        symbol: crypto.symbol.toUpperCase(),
                        price: parseFloat(crypto.price_usd) || 0,
                        marketCap: parseFloat(crypto.market_cap_usd) || 0,
                        volume: parseFloat(crypto.volume24) || 0,
                        logo: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${crypto.symbol.toLowerCase()}.png`,
                        priceChange: parseFloat(crypto.percent_change_24h) || 0
                    }));
                default:
                    return [];
            }
        } catch (error) {
            console.error("Error parsing API data:", error);
            return [];
        }
    }

    async searchCrypto(query) {
        if (query.length < 1) {
            this.renderCryptos(this.cryptos);
            return;
        }

        try {
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';

            if (this.selectedApi === 'coingecko') {
                // First, search for the coin to get its ID
                const searchResponse = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
                if (!searchResponse.ok) throw new Error('Search failed');
                
                const searchData = await searchResponse.json();
                
                if (searchData.coins && searchData.coins.length > 0) {
                    // Get the IDs of the first 5 matching coins
                    const coinIds = searchData.coins.slice(0, 5).map(coin => coin.id);
                    
                    // Fetch detailed data for these coins
                    const marketDataResponse = await fetch(
                        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=false`
                    );
                    
                    if (!marketDataResponse.ok) throw new Error('Failed to fetch coin details');
                    
                    const marketData = await marketDataResponse.json();
                    const parsedData = this.parseApiData(marketData);
                    this.renderCryptos(parsedData);
                } else {
                    this.errorElement.innerText = 'No matching cryptocurrencies found';
                    this.renderCryptos([]);
                }
            } else if (this.selectedApi === 'coinlore') {
                const response = await fetch(`https://api.coinlore.net/api/tickers/?search=${encodeURIComponent(query)}`);
                if (!response.ok) throw new Error('Failed to fetch data from CoinLore');
                const searchData = await response.json();

                if (searchData && searchData.data && searchData.data.length > 0) {
                    const newCryptos = this.parseApiData(searchData.data);
                    this.renderCryptos(newCryptos);
                } else {
                    this.errorElement.innerText = 'No matching cryptocurrencies found';
                    this.renderCryptos([]);
                }
            }
        } catch (error) {
            this.errorElement.innerText = error.message;
            this.renderCryptos([]);
        } finally {
            this.loadingElement.style.display = 'none';
        }
    }

    renderCryptos(cryptos) {
        this.cryptoContainer.innerHTML = '';
        
        if (cryptos.length === 0) {
            this.cryptoContainer.innerHTML = '<div class="no-results">No cryptocurrencies found</div>';
            return;
        }

        cryptos.forEach(crypto => {
            const card = document.createElement('div');
            card.className = 'crypto-card';
            card.innerHTML = `
                <img src="${crypto.logo}" alt="${crypto.name} logo" class="crypto-logo" 
                     onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png'">
                <h2>${crypto.name} (${crypto.symbol})</h2>
                <p>Price: $${crypto.price > 0 ? crypto.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 8}) : '0.00'}</p>
                <p>Market Cap: $${crypto.marketCap > 0 ? crypto.marketCap.toLocaleString() : '0'}</p>
                <p>Volume (24h): $${crypto.volume > 0 ? crypto.volume.toLocaleString() : '0'}</p>
                <p class="${crypto.priceChange >= 0 ? 'price-change-positive' : 'price-change-negative'}">
                    Change (24h): ${crypto.priceChange ? crypto.priceChange.toFixed(2) : '0.00'}%
                </p>
            `;
            this.cryptoContainer.appendChild(card);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CryptoTracker();
});
