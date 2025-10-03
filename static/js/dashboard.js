// DashboardState: manages global state and triggers chart updates
class DashboardState {
    constructor() {
        this.selectedPlants = [];
        this.filters = {};
        this.currentTab = 'explore';
    }

    updateSelectedPlants(plants) {
        this.selectedPlants = plants;
        this.refreshAllCharts();
    }

    setCurrentTab(tab) {
        this.currentTab = tab;
        this.refreshAllCharts();
    }

    refreshAllCharts() {
        if (this.currentTab === 'explore') {
            loadRootTypeChart(this.selectedPlants);
            loadSunburstChart(this.selectedPlants);
        } else if (this.currentTab === 'stress') {
            loadStressBarChart(this.selectedPlants);
            loadAdaptationCards(this.selectedPlants);
        } else if (this.currentTab === 'compare') {
            loadComparisonTable(this.selectedPlants);
            loadRadarChart(this.selectedPlants);
        }
    }
}

const dashboard = new DashboardState();

// UIManager: handles tab switching, advanced analytics, and UI events
class UIManager {
    constructor() {
        this.initTabs();
        this.initAdvanced();
    }

    initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
                document.getElementById(tab + 'Tab').classList.add('active');
                dashboard.setCurrentTab(tab);
            });
        });
    }

    initAdvanced() {
        document.getElementById('showAdvanced').addEventListener('click', () => {
            document.getElementById('advancedAnalytics').style.display = 'block';
            loadClusterChart();
            loadNetworkChart();
            loadVegetableChart();
        });
    }
}

// PlantSelector: handles plant search and selection
class PlantSelector {
    constructor() {
        this.selected = [];
        this.init();
    }

    async init() {
        const res = await fetch('/api/plant-list');
        this.plants = await res.json();
        // You can implement a search box and selection UI here
    }

    selectPlant(name) {
        if (!this.selected.includes(name)) {
            this.selected.push(name);
            dashboard.updateSelectedPlants(this.selected);
        }
    }

    removePlant(name) {
        this.selected = this.selected.filter(p => p !== name);
        dashboard.updateSelectedPlants(this.selected);
    }
}

// LoadingManager: handles the loading overlay
class LoadingManager {
    static show() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }
    static hide() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

// Chart loading functions (examples)
async function loadRootTypeChart(selectedPlants) {
    LoadingManager.show();
    const params = new URLSearchParams();
    selectedPlants.forEach(p => params.append('plants[]', p));
    const res = await fetch('/api/traits?' + params.toString());
    const data = await res.json();
    Plotly.newPlot('rootTypeChart', [{
        x: Object.keys(data.root_counts),
        y: Object.values(data.root_counts),
        type: 'bar'
    }], {title: 'Plants per Root Type'});
    LoadingManager.hide();
}

async function loadSunburstChart(selectedPlants) {
    // Implement sunburst chart loading here
}

async function loadStressBarChart(selectedPlants) {
    // Implement stress bar chart loading here
}

async function loadAdaptationCards(selectedPlants) {
    // Implement adaptation cards loading here
}

async function loadComparisonTable(selectedPlants) {
    // Implement comparison table loading here
}

async function loadRadarChart(selectedPlants) {
    // Implement radar chart loading here
}

async function loadClusterChart() {
    // Implement PCA cluster chart loading here
}

async function loadNetworkChart() {
    // Implement network chart loading here
}

async function loadVegetableChart() {
    // Implement vegetable pie chart loading here
}

// Initialize everything on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    LoadingManager.show();
    new UIManager();
    new PlantSelector();
    dashboard.refreshAllCharts();
    setTimeout(() => LoadingManager.hide(), 500); // Ensure loading overlay is visible briefly
});
