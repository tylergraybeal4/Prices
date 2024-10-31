class CryptoTracker {
    constructor() {
        this.apiUrl = 'https://api.coingecko.com/api/v3/coins/markets';
        this.cryptoContainer = document.getElementById('crypto-container');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error-message');
        this.errorNotification = document.createElement('div'); // Create the error notification
        this.errorNotification.id = 'error-notification';
        document.body.appendChild(this.errorNotification); // Add it to the body
        this.cryptos = [];
        this.page = 1;
        this.isLoading = false;

        // Set the current date and time when the page loads
        this.updateDateTime();
        this.startTimeUpdater(); // Start the time updater
    }

    updateDateTime() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        this.errorNotification.innerText = `Current Date & Time: ${now.toLocaleString('en-US', options)}`;
    }

    startTimeUpdater() {
        // Update the date and time every second
        this.timer = setInterval(() => {
            this.updateDateTime();
        }, 1000);

        // Show the notification and fade it out after 5 seconds
        this.errorNotification.style.display = 'block'; // Show the notification
        this.errorNotification.style.opacity = '1'; // Fade in
        this.errorNotification.style.visibility = 'visible'; // Make it interactive

        setTimeout(() => {
            this.fadeOutNotification(); // Fade out the notification
        }, 5000);
    }

    fadeOutNotification() {
        this.errorNotification.style.opacity = '0'; // Fade out
        setTimeout(() => {
            this.errorNotification.style.visibility = 'hidden'; // Hide the notification after fading out
            clearInterval(this.timer); // Stop the timer
        }, 500); // Match the duration of the fade out
    }

    async fetchCryptoData() {
        if (this.isLoading) return;

        try {
            this.isLoading = true;
            this.loadingElement.style.display = 'block';
            this.errorElement.innerHTML = '';

            const response = await fetch(`${this.apiUrl}?vs_currency=usd&order=market_cap_desc&per_page=100&page=${this.page}&sparkline=false`);
            if (!response.ok) throw new Error('Failed to fetch cryptocurrency data');

            const cryptos = await response.json();
            this.cryptos.push(...cryptos);
            this.renderCryptos(this.cryptos);

            this.page += 1;
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
            this.loadingElement.style.display = 'none';
        }
    }

    handleError(error) {
        console.error('Crypto Fetch Error:', error);
    }

    renderCryptos(cryptos) {
        this.cryptoContainer.innerHTML = '';
        cryptos.forEach((crypto, index) => {
            const cryptoCard = document.createElement('div');
            cryptoCard.className = 'crypto-card';
            const priceChangeClass = crypto.price_change_percentage_24h > 0 ? 'price-change-positive' : 'price-change-negative';

            // Safely handle toFixed
            const priceChangePercentage = crypto.price_change_percentage_24h !== null ? crypto.price_change_percentage_24h.toFixed(2) : 0;

            cryptoCard.innerHTML = `
                <img src="${crypto.image}" alt="${crypto.name}" class="crypto-logo">
                <h3>${crypto.name} (${crypto.symbol.toUpperCase()})</h3>
                <p>Rank: ${index + 1}</p>
                <p>Price: $${crypto.current_price}</p>
                <p class="${priceChangeClass}">24h Change: ${priceChangePercentage}%</p>
                <p>Market Cap: $${crypto.market_cap.toLocaleString()}</p>
                <p>Volume: $${crypto.total_volume.toLocaleString()}</p>
            `;
            this.cryptoContainer.appendChild(cryptoCard);
        });
    }

    filterCryptos(query) {
        const filtered = this.cryptos.filter(crypto => crypto.name.toLowerCase().includes(query.toLowerCase()));
        this.renderCryptos(filtered);
    }

    startTracking() {
        this.fetchCryptoData();
        setInterval(() => this.fetchCryptoData(), 60000);

        window.addEventListener('scroll', () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                this.fetchCryptoData();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cryptoTracker = new CryptoTracker();
    cryptoTracker.startTracking();

    const searchBar = document.getElementById('search-bar');
    searchBar.addEventListener('input', () => cryptoTracker.filterCryptos(searchBar.value));
});

function navigateTo(page) {
    window.location.href = `${page}.html`;
}
