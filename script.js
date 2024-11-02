class CryptoTracker {
    constructor() {
        this.apiUrls = {
            coingecko: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=',
            coinlore: 'https://api.coinlore.com/api/tickers/?start=0&limit=100'  // Fixed URL
        };
        this.cryptoContainer = document.getElementById('crypto-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error-message');
        this.currentDateTimeElement = document.getElementById('current-date-time');
        this.cryptos = [];
        this.selectedApi = 'coingecko';
        this.page = 1;
        this.searchTimeout = null;
        this.isLoading = false;  // Add loading state flag
        this.retryCount = 0;     // Add retry counter
        this.maxRetries = 3;     // Maximum number of retries
        this.retryDelay = 1000;  // Delay between retries in ms

        // Implement request throttling
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // Minimum time between requests in ms

        // Enhanced cache with expiration
        this.searchCache = new Map();
        this.cacheExpiration = 5 * 60 * 1000; // 5 minutes

        this.initializeEventListeners();
        this.startTimeUpdater();
        this.fetchCryptoData();
    }

    initializeEventListeners() {
        // Back to top button
        this.backToTopButton = document.getElementById('back-to-top');
        this.backToTopButton?.addEventListener('click', () => this.scrollToTop());
        window.addEventListener('scroll', () => this.toggleBackToTopButton());

        // API selector
        document.getElementById('api-selector')?.addEventListener('change', (e) => {
            this.selectedApi = e.target.value;
            this.page = 1;
            this.cryptos = [];
            this.fetchCryptoData();
        });

        // Search bar with debouncing
        const searchBar = document.getElementById('search-bar');
        searchBar?.addEventListener('input', (e) => {
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            const query = e.target.value.trim();
            
            if (!query) {
                this.renderCryptos(this.cryptos);
                return;
            }

            this.searchTimeout = setTimeout(() => {
                this.searchCrypto(query);
            }, 500);
        });

        // Load more button
        document.getElementById('load-more')?.addEventListener('click', () => {
            if (!this.isLoading) {
                this.loadMore();
            }
        });
    }

    async throttleRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve => 
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        
        this.lastRequestTime = Date.now();
    }

    async fetchWithRetry(url, options = {}) {
        let lastError;
        
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                await this.throttleRequest();
                const response = await fetch(url, options);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                lastError = error;
                await new Promise(resolve => 
                    setTimeout(resolve, this.retryDelay * Math.pow(2, i))
                );
            }
        }
        
        throw lastError;
    }

    async fetchCryptoData() {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';
            
            // Check cache
            const cacheKey = `${this.selectedApi}_${this.page}`;
            const cachedData = this.searchCache.get(cacheKey);
            
            if (cachedData && Date.now() - cachedData.timestamp < this.cacheExpiration) {
                this.cryptos = this.cryptos.concat(cachedData.data);
                this.renderCryptos(this.cryptos);
                return;
            }

            const url = this.selectedApi === 'coinlore' 
                ? `${this.apiUrls.coinlore}&start=${(this.page - 1) * 100}`
                : this.apiUrls.coingecko + this.page;

            const data = await this.fetchWithRetry(url);
            const newCryptos = this.parseApiData(data);
            
            // Cache the fetched data with timestamp
            this.searchCache.set(cacheKey, {
                data: newCryptos,
                timestamp: Date.now()
            });
            
            this.cryptos = this.cryptos.concat(newCryptos);
            this.renderCryptos(this.cryptos);
        } catch (error) {
            this.errorElement.innerText = `Error: ${error.message}. Please try again later.`;
            this.renderCryptos([]);
        } finally {
            this.isLoading = false;
            this.loadingElement.style.display = 'none';
        }
    }

    parseApiData(data) {
        try {
            switch (this.selectedApi) {
                case 'coingecko':
                    if (!Array.isArray(data)) return [];
                    return data.map(crypto => this.formatCryptoData({
                        name: crypto.name,
                        symbol: crypto.symbol?.toUpperCase(),
                        price: crypto.current_price,
                        marketCap: crypto.market_cap,
                        volume: crypto.total_volume,
                        logo: crypto.image,
                        priceChange: crypto.price_change_percentage_24h
                    }));
                case 'coinlore':
                    const cryptos = data?.data || [];
                    return cryptos.map(crypto => this.formatCryptoData({
                        name: crypto.name,
                        symbol: crypto.symbol?.toUpperCase(),
                        price: parseFloat(crypto.price_usd),
                        marketCap: parseFloat(crypto.market_cap_usd),
                        volume: parseFloat(crypto.volume24),
                        logo: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${crypto.symbol?.toLowerCase()}.png`,
                        priceChange: parseFloat(crypto.percent_change_24h)
                    }));
                default:
                    return [];
            }
        } catch (error) {
            console.error("Error parsing API data:", error);
            return [];
        }
    }

    formatCryptoData(crypto) {
        return {
            name: crypto.name || 'Unknown',
            symbol: crypto.symbol || '???',
            price: this.validateNumber(crypto.price),
            marketCap: this.validateNumber(crypto.marketCap),
            volume: this.validateNumber(crypto.volume),
            logo: crypto.logo || 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png',
            priceChange: this.validateNumber(crypto.priceChange)
        };
    }

    validateNumber(value) {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    }

    async searchCrypto(query) {
        if (query.length < 2 || this.isLoading) return;

        try {
            this.isLoading = true;
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';

            const cacheKey = `search_${this.selectedApi}_${query}`;
            const cachedResults = this.searchCache.get(cacheKey);
            
            if (cachedResults && Date.now() - cachedResults.timestamp < this.cacheExpiration) {
                this.renderCryptos(cachedResults.data);
                return;
            }

            let searchResults = [];
            
            if (this.selectedApi === 'coingecko') {
                const searchData = await this.fetchWithRetry(
                    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
                );
                
                if (searchData.coins?.length > 0) {
                    const coinIds = searchData.coins.slice(0, 5).map(coin => coin.id);
                    const marketData = await this.fetchWithRetry(
                        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=false`
                    );
                    searchResults = this.parseApiData(marketData);
                }
            } else if (this.selectedApi === 'coinlore') {
                const searchData = await this.fetchWithRetry(
                    `https://api.coinlore.com/api/tickers/?search=${encodeURIComponent(query)}`
                );
                searchResults = this.parseApiData(searchData);
            }

            this.searchCache.set(cacheKey, {
                data: searchResults,
                timestamp: Date.now()
            });

            if (searchResults.length === 0) {
                this.errorElement.innerText = 'No matching cryptocurrencies found';
            }
            
            this.renderCryptos(searchResults);
        } catch (error) {
            this.errorElement.innerText = `Search error: ${error.message}. Please try again later.`;
            this.renderCryptos([]);
        } finally {
            this.isLoading = false;
            this.loadingElement.style.display = 'none';
        }
    }

    renderCryptos(cryptos) {
        if (!this.cryptoContainer) return;
        
        this.cryptoContainer.innerHTML = '';
        
        if (!cryptos?.length) {
            this.cryptoContainer.innerHTML = '<div class="no-results">No cryptocurrencies found</div>';
            return;
        }

        cryptos.forEach(crypto => {
            const card = document.createElement('div');
            card.className = 'crypto-card';
            card.innerHTML = `
                <img src="${crypto.logo}" alt="${this.escapeHtml(crypto.name)} logo" class="crypto-logo" 
                     onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png'">
                <h2>${this.escapeHtml(crypto.name)} (${this.escapeHtml(crypto.symbol)})</h2>
                <p>Price: $${this.formatNumber(crypto.price, 8)}</p>
                <p>Market Cap: $${this.formatNumber(crypto.marketCap, 0)}</p>
                <p>Volume (24h): $${this.formatNumber(crypto.volume, 0)}</p>
                <p class="${crypto.priceChange >= 0 ? 'price-change-positive' : 'price-change-negative'}">
                    Change (24h): ${this.formatNumber(crypto.priceChange, 2)}%
                </p>
            `;
            this.cryptoContainer.appendChild(card);
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatNumber(value, decimals = 2) {
        const num = parseFloat(value);
        if (isNaN(num)) return '0.00';
        
        return num.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    toggleBackToTopButton() {
        if (this.backToTopButton) {
            this.backToTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateDateTime() {
        if (this.currentDateTimeElement) {
            const now = new Date();
            this.currentDateTimeElement.innerText = `Current Date & Time: ${now.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })}`;
        }
    }

    startTimeUpdater() {
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 1000);
    }

    loadMore() {
        this.page += 1;
        this.fetchCryptoData();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CryptoTracker();
});
