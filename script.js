class CryptoTracker {
    static DEFAULT_OPTIONS = {
        maxRetries: 3,
        retryDelay: 1000,
        minRequestInterval: 1000,
        cacheExpiration: 5 * 60 * 1000,
        searchDebounceTime: 500,
        itemsPerPage: 100
    };

    static APIS = {
        coingecko: {
            markets: (page) => `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}`,
            search: (query) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
            searchDetails: (ids) => `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&sparkline=false`
        },
        coinlore: {
            markets: (page) => `https://api.coinlore.com/api/tickers/?start=${(page - 1) * 100}&limit=100`,
            search: (query) => `https://api.coinlore.com/api/tickers/?search=${encodeURIComponent(query)}`
        }
    };

    constructor() {
        this.initializeState();
        this.initializeElements();
        this.initializeEventListeners();
        this.startTimeUpdater();
        this.fetchCryptoData().catch(this.handleError.bind(this));
    }

    initializeState() {
        this.cryptos = [];
        this.selectedApi = 'coingecko';
        this.page = 1;
        this.isLoading = false;
        this.retryCount = 0;
        this.lastRequestTime = 0;
        this.searchCache = new Map();
        this.searchController = null;
    }

    initializeElements() {
        this.elements = new Proxy({
            cryptoContainer: document.getElementById('crypto-container'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error-message'),
            currentDateTime: document.getElementById('current-date-time'),
            backToTopButton: document.getElementById('back-to-top'),
            apiSelector: document.getElementById('api-selector'),
            searchBar: document.getElementById('search-bar'),
            loadMoreButton: document.getElementById('load-more')
        }, {
            get: (target, prop) => {
                const element = target[prop];
                if (!element) {
                    console.warn(`Element '${prop}' not found in the DOM`);
                    return { style: {}, classList: { add: () => {}, remove: () => {} } };
                }
                return element;
            }
        });
    }

    initializeEventListeners() {
        this.elements.backToTopButton?.addEventListener('click', () => this.scrollToTop());
        window.addEventListener('scroll', this.throttle(this.toggleBackToTopButton.bind(this), 100));
        this.elements.apiSelector?.addEventListener('change', (e) => this.changeApi(e.target.value));
        this.elements.searchBar?.addEventListener('input', this.debounce(
            (e) => this.handleSearchInput(e.target.value.trim()),
            CryptoTracker.DEFAULT_OPTIONS.searchDebounceTime
        ));
        this.elements.loadMoreButton?.addEventListener('click', () => this.loadMore());
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    async changeApi(api) {
        try {
            this.selectedApi = api;
            this.page = 1;
            this.cryptos = [];
            await this.fetchCryptoData();
        } catch (error) {
            this.handleError(error);
        }
    }

    async handleSearchInput(query) {
        try {
            // Cancel previous search if it exists
            if (this.searchController) {
                this.searchController.abort();
            }
            this.searchController = new AbortController();

            if (!query) {
                this.renderCryptos(this.cryptos);
                return;
            }

            await this.searchCrypto(query, this.searchController.signal);
        } catch (error) {
            if (error.name === 'AbortError') return;
            this.handleError(error);
        }
    }

    async throttleRequest() {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < CryptoTracker.DEFAULT_OPTIONS.minRequestInterval) {
            await new Promise(resolve => 
                setTimeout(resolve, CryptoTracker.DEFAULT_OPTIONS.minRequestInterval - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    async fetchWithRetry(url, signal) {
        let lastError;
        for (let i = 0; i < CryptoTracker.DEFAULT_OPTIONS.maxRetries; i++) {
            try {
                await this.throttleRequest();
                const response = await fetch(url, { signal });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (!data) throw new Error('Invalid API response');
                return data;
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                lastError = error;
                const delay = CryptoTracker.DEFAULT_OPTIONS.retryDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }

    async fetchCryptoData(signal) {
        if (this.isLoading) return;
        
        try {
            this.showLoading();
            const cacheKey = `${this.selectedApi}_${this.page}`;
            const cachedData = this.searchCache.get(cacheKey);

            if (this.isCacheValid(cachedData)) {
                this.cryptos = [...this.cryptos, ...cachedData.data];
                this.renderCryptos(this.cryptos);
                return;
            }

            const apiUrl = CryptoTracker.APIS[this.selectedApi].markets(this.page);
            const data = await this.fetchWithRetry(apiUrl, signal);
            const newCryptos = this.parseApiData(data);
            
            this.searchCache.set(cacheKey, { 
                data: newCryptos, 
                timestamp: Date.now() 
            });
            
            this.cryptos = [...this.cryptos, ...newCryptos];
            this.renderCryptos(this.cryptos);
        } catch (error) {
            if (error.name === 'AbortError') return;
            throw error;
        } finally {
            this.hideLoading();
        }
    }

    isCacheValid(cachedData) {
        return cachedData && 
               Date.now() - cachedData.timestamp < CryptoTracker.DEFAULT_OPTIONS.cacheExpiration;
    }

    parseApiData(data) {
        const parser = {
            coingecko: (crypto) => ({
                name: crypto.name,
                symbol: crypto.symbol?.toUpperCase(),
                price: crypto.current_price,
                marketCap: crypto.market_cap,
                volume: crypto.total_volume,
                logo: crypto.image,
                priceChange: crypto.price_change_percentage_24h
            }),
            coinlore: (crypto) => ({
                name: crypto.name,
                symbol: crypto.symbol?.toUpperCase(),
                price: parseFloat(crypto.price_usd),
                marketCap: parseFloat(crypto.market_cap_usd),
                volume: parseFloat(crypto.volume24),
                logo: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${crypto.symbol?.toLowerCase()}.png`,
                priceChange: parseFloat(crypto.percent_change_24h)
            })
        };

        const cryptoData = this.selectedApi === 'coingecko' ? data : (data.data || []);
        return cryptoData
            .map(crypto => parser[this.selectedApi](crypto))
            .map(this.formatCryptoData.bind(this));
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
        return isNaN(num) || !isFinite(num) ? 0 : num;
    }

    async searchCrypto(query, signal) {
        if (query.length < 2 || this.isLoading) return;
        
        try {
            this.showLoading();
            const cacheKey = `search_${this.selectedApi}_${query}`;
            const cachedResults = this.searchCache.get(cacheKey);
            
            if (this.isCacheValid(cachedResults)) {
                this.renderCryptos(cachedResults.data);
                return;
            }

            const searchResults = await this.performSearch(query, signal);
            
            if (signal?.aborted) return;
            
            this.searchCache.set(cacheKey, { 
                data: searchResults, 
                timestamp: Date.now() 
            });
            
            this.renderCryptos(searchResults);
        } finally {
            this.hideLoading();
        }
    }

    async performSearch(query, signal) {
        if (this.selectedApi === 'coingecko') {
            const searchData = await this.fetchWithRetry(
                CryptoTracker.APIS.coingecko.search(query),
                signal
            );
            
            if (!searchData.coins?.length) return [];
            
            const coinIds = searchData.coins.slice(0, 5).map(coin => coin.id);
            const marketData = await this.fetchWithRetry(
                CryptoTracker.APIS.coingecko.searchDetails(coinIds),
                signal
            );
            
            return this.parseApiData(marketData);
        } else {
            const searchData = await this.fetchWithRetry(
                CryptoTracker.APIS.coinlore.search(query),
                signal
            );
            return this.parseApiData(searchData);
        }
    }

    renderCryptos(cryptos) {
        if (!this.elements.cryptoContainer) return;
        
        this.elements.cryptoContainer.innerHTML = cryptos.length 
            ? cryptos.map(crypto => this.createCryptoCard(crypto)).join('')
            : '<div class="no-results">No cryptocurrencies found</div>';
    }

    createCryptoCard(crypto) {
        return `
            <div class="crypto-card">
                <img src="${this.escapeHtml(crypto.logo)}" 
                     alt="${this.escapeHtml(crypto.name)} logo" 
                     class="crypto-logo" 
                     onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/generic.png'">
                <h2>${this.escapeHtml(crypto.name)} (${this.escapeHtml(crypto.symbol)})</h2>
                <p>Price: $${this.formatNumber(crypto.price, crypto.price < 1 ? 8 : 2)}</p>
                <p>Market Cap: $${this.formatNumber(crypto.marketCap, 0)}</p>
                <p>Volume (24h): $${this.formatNumber(crypto.volume, 0)}</p>
                <p class="${crypto.priceChange >= 0 ? 'price-change-positive' : 'price-change-negative'}">
                    Change (24h): ${this.formatNumber(crypto.priceChange, 2)}%
                </p>
            </div>`;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    formatNumber(value, decimals = 2) {
        try {
            const num = parseFloat(value);
            if (isNaN(num) || !isFinite(num)) return '0.00';
            return num.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        } catch (error) {
            console.error('Error formatting number:', error);
            return '0.00';
        }
    }

    handleError(error) {
        console.error('CryptoTracker Error:', error);
        this.showError(`Error: ${error.message}. Please try again later.`);
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
        this.elements.backToTopButton.style.display = 
            window.scrollY > 300 ? 'block' : 'none';
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateDateTime() {
        this.elements.currentDateTime.innerText = 
            `Current Date & Time: ${new Date().toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })}`;
    }

    startTimeUpdater() {
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 1000);
    }

    async loadMore() {
        try {
            this.page += 1;
            await this.fetchCryptoData();
        } catch (error) {
            this.handleError(error);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new CryptoTracker());
