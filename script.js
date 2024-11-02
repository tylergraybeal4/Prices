class CryptoTracker {
    constructor() {
        this.apiUrls = {
            coingecko: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=',
            coinlore: 'https://api.coinlore.com/api/tickers/?start=0&limit=100'
        };
        this.elements = {
            cryptoContainer: document.getElementById('crypto-container'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error-message'),
            currentDateTime: document.getElementById('current-date-time'),
            backToTopButton: document.getElementById('back-to-top'),
            apiSelector: document.getElementById('api-selector'),
            searchBar: document.getElementById('search-bar'),
            loadMoreButton: document.getElementById('load-more')
        };
        this.cryptos = [];
        this.selectedApi = 'coingecko';
        this.page = 1;
        this.searchTimeout = null;
        this.isLoading = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000;
        this.searchCache = new Map();
        this.cacheExpiration = 5 * 60 * 1000;
        
        this.initializeEventListeners();
        this.startTimeUpdater();
        this.fetchCryptoData();
    }

    initializeEventListeners() {
        this.elements.backToTopButton?.addEventListener('click', () => this.scrollToTop());
        window.addEventListener('scroll', () => this.toggleBackToTopButton());
        
        this.elements.apiSelector?.addEventListener('change', (e) => this.changeApi(e.target.value));
        this.elements.searchBar?.addEventListener('input', (e) => this.handleSearchInput(e.target.value.trim()));
        this.elements.loadMoreButton?.addEventListener('click', () => this.loadMore());
    }

    changeApi(api) {
        this.selectedApi = api;
        this.page = 1;
        this.cryptos = [];
        this.fetchCryptoData();
    }

    handleSearchInput(query) {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        
        if (!query) {
            this.renderCryptos(this.cryptos);
            return;
        }

        this.searchTimeout = setTimeout(() => this.searchCrypto(query), 500);
    }

    async throttleRequest() {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();
    }

    async fetchWithRetry(url) {
        let lastError;
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                await this.throttleRequest();
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, i)));
            }
        }
        throw lastError;
    }

    async fetchCryptoData() {
        if (this.isLoading) return;
        try {
            this.showLoading();
            const cacheKey = `${this.selectedApi}_${this.page}`;
            const cachedData = this.searchCache.get(cacheKey);

            if (cachedData && Date.now() - cachedData.timestamp < this.cacheExpiration) {
                this.cryptos = [...this.cryptos, ...cachedData.data];
                this.renderCryptos(this.cryptos);
                return;
            }

            const url = this.selectedApi === 'coinlore' 
                ? `${this.apiUrls.coinlore}&start=${(this.page - 1) * 100}`
                : `${this.apiUrls.coingecko}${this.page}`;

            const data = await this.fetchWithRetry(url);
            const newCryptos = this.parseApiData(data);
            
            this.searchCache.set(cacheKey, { data: newCryptos, timestamp: Date.now() });
            this.cryptos = [...this.cryptos, ...newCryptos];
            this.renderCryptos(this.cryptos);
        } catch (error) {
            this.showError(`Error: ${error.message}. Please try again later.`);
        } finally {
            this.hideLoading();
        }
    }

    parseApiData(data) {
        return this.selectedApi === 'coingecko'
            ? data.map(crypto => this.formatCryptoData({
                name: crypto.name,
                symbol: crypto.symbol?.toUpperCase(),
                price: crypto.current_price,
                marketCap: crypto.market_cap,
                volume: crypto.total_volume,
                logo: crypto.image,
                priceChange: crypto.price_change_percentage_24h
            }))
            : (data.data || []).map(crypto => this.formatCryptoData({
                name: crypto.name,
                symbol: crypto.symbol?.toUpperCase(),
                price: parseFloat(crypto.price_usd),
                marketCap: parseFloat(crypto.market_cap_usd),
                volume: parseFloat(crypto.volume24),
                logo: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${crypto.symbol?.toLowerCase()}.png`,
                priceChange: parseFloat(crypto.percent_change_24h)
            }));
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
            this.showLoading();
            const cacheKey = `search_${this.selectedApi}_${query}`;
            const cachedResults = this.searchCache.get(cacheKey);
            
            if (cachedResults && Date.now() - cachedResults.timestamp < this.cacheExpiration) {
                this.renderCryptos(cachedResults.data);
                return;
            }

            let searchResults = [];
            if (this.selectedApi === 'coingecko') {
                const searchData = await this.fetchWithRetry(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
                if (searchData.coins?.length) {
                    const coinIds = searchData.coins.slice(0, 5).map(coin => coin.id);
                    const marketData = await this.fetchWithRetry(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=false`);
                    searchResults = this.parseApiData(marketData);
                }
            } else {
                const searchData = await this.fetchWithRetry(`https://api.coinlore.com/api/tickers/?search=${encodeURIComponent(query)}`);
                searchResults = this.parseApiData(searchData);
            }

            this.searchCache.set(cacheKey, { data: searchResults, timestamp: Date.now() });
            this.renderCryptos(searchResults.length ? searchResults : []);
        } catch (error) {
            this.showError(`Search error: ${error.message}. Please try again later.`);
        } finally {
            this.hideLoading();
        }
    }

    renderCryptos(cryptos) {
        if (!this.elements.cryptoContainer) return;
        this.elements.cryptoContainer.innerHTML = cryptos.length 
            ? cryptos.map(crypto => `
                <div class="crypto-card">
                    <img src="${crypto.logo}" alt="${this.escapeHtml(crypto.name)} logo" class="crypto-logo" 
                         onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png'">
                    <h2>${this.escapeHtml(crypto.name)} (${this.escapeHtml(crypto.symbol)})</h2>
                    <p>Price: $${this.formatNumber(crypto.price, 8)}</p>
                    <p>Market Cap: $${this.formatNumber(crypto.marketCap, 0)}</p>
                    <p>Volume (24h): $${this.formatNumber(crypto.volume, 0)}</p>
                    <p class="${crypto.priceChange >= 0 ? 'price-change-positive' : 'price-change-negative'}">
                        Change (24h): ${this.formatNumber(crypto.priceChange, 2)}%
                    </p>
                </div>`).join('')
            : '<div class="no-results">No cryptocurrencies found</div>';
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatNumber(value, decimals = 2) {
        const num = parseFloat(value);
        return isNaN(num) ? '0.00' : num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    showError(message) {
        this.elements.error.innerText = message;
        this.elements.cryptoContainer.innerHTML = '<div class="no-results">No cryptocurrencies found</div>';
    }

    showLoading() {
        this.isLoading = true;
        this.elements.loading.style.display = 'block';
        this.elements.error.innerText = '';
    }

    hideLoading() {
        this.isLoading = false;
        this.elements.loading.style.display = 'none';
    }

    toggleBackToTopButton() {
        if (this.elements.backToTopButton) {
            this.elements.backToTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateDateTime() {
        if (this.elements.currentDateTime) {
            this.elements.currentDateTime.innerText = `Current Date & Time: ${new Date().toLocaleString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
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
// Format price to 2-3 decimal places
function formatPrice(price) {
    return price.toFixed(price < 1 ? 3 : 2);
}

// Apply positive or negative color class
function updatePriceChange(element, change) {
    if (change > 0) {
        element.classList.add('price-change-positive');
        element.classList.remove('price-change-negative');
    } else {
        element.classList.add('price-change-negative');
        element.classList.remove('price-change-positive');
    }
}

document.addEventListener('DOMContentLoaded', () => new CryptoTracker());
