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
        
        // Also fetch location and history when refreshing
        fetchLocation();
        fetchHistory();
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
            
            // Trigger weather and prayers with new coordinates
            fetchWeather(lat, lon);
            fetchPrayers(lat, lon);
            
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

    async function fetchWeather(lat, lon) {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const data = await res.json();
            const temp = data.current_weather.temperature;
            const code = data.current_weather.weathercode;
            
            document.getElementById('weather-temp').textContent = `${temp}°C`;
            
            // Simple mapping for weather codes
            let icon = "⛅";
            let desc = "Partly Cloudy";
            if (code === 0) { icon = "☀️"; desc = "Clear Sky"; }
            else if (code <= 3) { icon = "⛅"; desc = "Cloudy"; }
            else if (code <= 48) { icon = "🌫️"; desc = "Foggy"; }
            else if (code <= 67) { icon = "🌧️"; desc = "Rain"; }
            else if (code <= 77) { icon = "❄️"; desc = "Snow"; }
            else if (code >= 80) { icon = "⛈️"; desc = "Thunderstorm"; }
            
            document.getElementById('weather-icon').textContent = icon;
            document.getElementById('weather-desc').textContent = desc;
        } catch (e) {
            console.error("Weather error:", e);
            document.getElementById('weather-desc').textContent = "Failed to load";
        }
    }

    async function fetchPrayers(lat, lon) {
        try {
            const dateStr = new Date().getDate() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getFullYear();
            const res = await fetch(`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=1`);
            const data = await res.json();
            
            const timings = data.data.timings;
            document.getElementById('pt-fajr').textContent = timings.Fajr;
            document.getElementById('pt-dhuhr').textContent = timings.Dhuhr;
            document.getElementById('pt-asr').textContent = timings.Asr;
            document.getElementById('pt-maghrib').textContent = timings.Maghrib;
            document.getElementById('pt-isha').textContent = timings.Isha;
            
            document.getElementById('hijri-date').textContent = data.data.date.hijri.date;
        } catch (e) {
            console.error("Prayer time error:", e);
        }
    }

    let historyChartInstance = null;
    async function fetchHistory() {
        try {
            const res = await fetch('api/history.json?t=' + new Date().getTime());
            if (!res.ok) return;
            const data = await res.json();
            
            const meters = Object.keys(data);
            if (meters.length === 0) return;
            
            // Prepare datasets for Chart.js
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
            
            let labels = [];
            let maxLen = 0;
            let longestMeter = "";
            
            // Find longest array for labels
            meters.forEach(meter => {
                if (data[meter].length > maxLen) {
                    maxLen = data[meter].length;
                    longestMeter = meter;
                }
            });
            
            if (longestMeter) {
                labels = data[longestMeter].map(item => item.time.split(',')[1].trim()); // just time
            }
            
            meters.forEach((meter, index) => {
                datasets.push({
                    label: `Meter ${meter}`,
                    data: data[meter].map(item => item.balance),
                    borderColor: colors[index % colors.length],
                    tension: 0.4,
                    pointRadius: 3,
                    borderWidth: 2,
                    fill: false
                });
            });
            
            const ctx = document.getElementById('historyChart').getContext('2d');
            
            if (historyChartInstance) {
                historyChartInstance.destroy();
            }
            
            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = 'Inter';
            
            historyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#e2e8f0',
                                usePointStyle: true,
                                boxWidth: 6
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#cbd5e1',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        y: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                drawBorder: false,
                            },
                            ticks: {
                                callback: function(value) {
                                    return '৳' + value;
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
            
        } catch (e) {
            console.error("History chart error:", e);
        }
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
