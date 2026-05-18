document.addEventListener('DOMContentLoaded', () => {
    const metersContainer = document.getElementById('meters-container');
    const refreshBtn = document.getElementById('refresh-btn');

    // Add loading class initially
    document.body.classList.add('loading');

    async function fetchBalance() {
        try {
            refreshBtn.classList.add('spinning');
            
            // Add a cache-busting timestamp in production, but try to fetch local api/balance.json
            const response = await fetch('api/balance.json?t=' + new Date().getTime());
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            
            updateUI(data);
        } catch (error) {
            console.error('Error fetching balance:', error);
            
            // Try to load from localStorage as fallback
            const cachedData = localStorage.getItem('dpdc_balance_cache');
            if (cachedData) {
                updateUI(JSON.parse(cachedData), true);
            } else {
                metersContainer.innerHTML = '<p style="text-align:center; color: #ef4444;">Offline. No cached data available.</p>';
            }
        } finally {
            setTimeout(() => {
                refreshBtn.classList.remove('spinning');
                document.body.classList.remove('loading');
            }, 500); // Small delay for visual feedback
        }
        
        // Also fetch location when refreshing
        fetchLocation();
    }

    function updateUI(dataArray, isCached = false) {
        // Save to cache
        if (!isCached) {
            localStorage.setItem('dpdc_balance_cache', JSON.stringify(dataArray));
        }

        metersContainer.innerHTML = ''; // Clear container

        if (!Array.isArray(dataArray)) {
            dataArray = [dataArray]; // Handle old single object format if cached
        }

        dataArray.forEach(data => {
            const isActive = data.connectionStatus.toLowerCase() === 'active';
            const statusClass = isActive ? 'active' : 'offline';
            const statusText = isActive ? 'Active' : data.connectionStatus;
            
            const cardHTML = `
                <div class="balance-card glass">
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <p class="card-label">Meter ${data.meterNumber}</p>
                        <div class="status-badge ${statusClass}">
                            <span class="pulse"></span>
                            <span>${statusText}</span>
                        </div>
                    </div>
                    <div class="balance-amount">
                        <span class="currency">৳</span>
                        <span id="balance-value">${formatCurrency(data.balanceRemaining)}</span>
                    </div>
                    
                    <div class="card-details">
                        <div class="detail-item">
                            <span class="detail-label">Account ID</span>
                            <span class="detail-value">${data.accountId}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Updated</span>
                            <span class="detail-value">${getRelativeTime(new Date(data.lastUpdated))}</span>
                        </div>
                    </div>
                </div>
            `;
            metersContainer.innerHTML += cardHTML;
        });
    }

    function formatCurrency(num) {
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getRelativeTime(date) {
        const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
        const daysDifference = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));
        const hoursDifference = Math.round((date - new Date()) / (1000 * 60 * 60));
        const minutesDifference = Math.round((date - new Date()) / (1000 * 60));

        if (Math.abs(minutesDifference) < 60) {
            if (minutesDifference === 0) return 'Just now';
            return rtf.format(minutesDifference, 'minute');
        } else if (Math.abs(hoursDifference) < 24) {
            return rtf.format(hoursDifference, 'hour');
        } else {
            return rtf.format(daysDifference, 'day');
        }
    }

    refreshBtn.addEventListener('click', fetchBalance);

    function fetchLocation() {
        const locAddress = document.getElementById('location-address');
        const locCoords = document.getElementById('location-coords');
        const locBadge = document.getElementById('loc-status-badge');
        const locStatusText = document.getElementById('loc-status-text');
        
        if (!navigator.geolocation) {
            locAddress.textContent = "Geolocation is not supported by your browser";
            locBadge.className = 'status-badge offline';
            locStatusText.textContent = 'Error';
            return;
        }

        locAddress.textContent = "Locating...";
        locBadge.className = 'status-badge active';
        locStatusText.textContent = 'Locating';
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            locCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            
            try {
                const LOCATION_IQ_KEY = "pk.b7ea6d09c816f9a9a1f46b5c11c9c93d";
                const response = await fetch(`https://us1.locationiq.com/v1/reverse?key=${LOCATION_IQ_KEY}&lat=${lat}&lon=${lon}&format=json`);
                
                if (!response.ok) {
                    throw new Error("API Limit Reached or Invalid Key");
                }
                
                const data = await response.json();
                
                let address = data.display_name;
                // Make it shorter if it's too long
                const parts = address.split(', ');
                if (parts.length > 4) {
                    address = parts.slice(0, 4).join(', ');
                }
                
                locAddress.textContent = address;
                locBadge.className = 'status-badge active';
                locStatusText.textContent = 'Active';
                
            } catch (error) {
                console.error("Error fetching address:", error);
                locAddress.textContent = "Location found (Address lookup failed)";
                locBadge.className = 'status-badge offline';
                locStatusText.textContent = 'Offline';
            }
            
        }, (error) => {
            console.error("Geolocation error:", error);
            locBadge.className = 'status-badge offline';
            locStatusText.textContent = 'Denied';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    locAddress.textContent = "Location permission denied.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    locAddress.textContent = "Location information unavailable.";
                    break;
                case error.TIMEOUT:
                    locAddress.textContent = "Location request timed out.";
                    break;
                default:
                    locAddress.textContent = "An unknown location error occurred.";
                    break;
            }
        });
    }

    // Initial fetch
    fetchBalance();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }
});
