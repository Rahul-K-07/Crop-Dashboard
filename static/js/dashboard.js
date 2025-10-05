// DashboardState: manages global state and triggers chart updates
class DashboardState {
    constructor() {
        this.selectedPlants = [];
        this.filters = {
            root_system: [],
            root_depth: [],
            growth_form: [],
            stress_tolerance: [],
            usage: []
        };
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
            loadRootTypeChart(this.selectedPlants, this.filters);
            loadSunburstChart(this.selectedPlants, this.filters);
        } else if (this.currentTab === 'stress') {
            loadStressBarChart(this.selectedPlants, this.filters);
            loadAdaptationCards(this.selectedPlants, this.filters);
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
        this.initLandingActions();
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
            const wrap = document.getElementById('advancedAnalytics');
            wrap.style.display = 'block';
            // Delay rendering until after layout is updated
            setTimeout(() => {
                loadParallelCats();
            }, 50);
        });
    }

    initLandingActions() {
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('landingPage').style.display = 'none';
                document.getElementById('mainDashboard').style.display = 'flex';
            });
        });
        // Simple main search: add first match to comparison on Enter
        const input = document.getElementById('mainSearch');
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const q = input.value.trim();
                if (!q) return;
                const res = await fetch('/api/plant-search?q=' + encodeURIComponent(q));
                const items = await res.json();
                if (items.length) {
                    const item = items[0];
                    const value = item.id || item.scientific || item.name;
                    const label = item.text || item.name || value;
                    const compare = $('#compareSelect');
                    // Ensure option exists and select it
                    if (!compare.find(`option[value="${value}"]`).length) {
                        const newOption = new Option(label, value, true, true);
                        compare.append(newOption).trigger('change');
                    } else {
                        const values = compare.val() || [];
                        if (!values.includes(value)) {
                            compare.val(values.concat(value)).trigger('change');
                        }
                    }
                    document.getElementById('landingPage').style.display = 'none';
                    document.getElementById('mainDashboard').style.display = 'flex';
                }
            }
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
        // Build global index: Plant ID -> Common Name
        window.PLANT_INDEX = {};
        (this.plants || []).forEach(p => { window.PLANT_INDEX[p.id] = p.text; });
        // Populate compare select with Select2
        const compare = $('#compareSelect');
        compare.select2({
            placeholder: 'Select plants to compare',
            width: '100%',
            data: this.plants.map(p => ({ id: p.id, text: p.text }))
        });
        compare.on('change', (e) => {
            const values = compare.val() || [];
            this.selected = values;
            dashboard.updateSelectedPlants(values);
        });
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
function buildQuery(selectedPlants, filters) {
    const params = new URLSearchParams();
    (selectedPlants || []).forEach(p => params.append('plants[]', p));
    (filters.root_system || []).forEach(v => params.append('root_system[]', v));
    (filters.root_depth || []).forEach(v => params.append('root_depth[]', v));
    (filters.growth_form || []).forEach(v => params.append('growth_form[]', v));
    (filters.stress_tolerance || []).forEach(v => params.append('stress_tolerance[]', v));
    (filters.usage || []).forEach(v => params.append('usage[]', v));
    return params;
}

async function loadRootTypeChart(selectedPlants, filters) {
    LoadingManager.show();
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/traits?' + params.toString());
    const data = await res.json();
    const counts = data.root_system_counts || {};
    Plotly.newPlot('rootTypeChart', [{
        x: Object.keys(counts),
        y: Object.values(counts),
        type: 'bar'
    }], {title: 'Plants per Root System'});
    LoadingManager.hide();
}

async function loadSunburstChart(selectedPlants, filters) {
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/sunburst?' + params.toString());
    const data = await res.json();
    const trace = [{
        type: 'sunburst',
        labels: data.labels,
        parents: data.parents,
        values: data.values,
        branchvalues: 'total'
    }];
    const title = (data.filters_active ? 'Growth → Leaf Traits → Plants' : 'Growth → Leaf Traits');
    Plotly.newPlot('sunburstChart', trace, {title});
}

async function loadStressBarChart(selectedPlants, filters) {
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/stress?' + params.toString());
    const data = await res.json();
    Plotly.newPlot('stressBarChart', [{
        x: Object.keys(data.stress_counts),
        y: Object.values(data.stress_counts),
        type: 'bar'
    }], {title: 'Stress Tolerance'});
}

async function loadAdaptationCards(selectedPlants, filters) {
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/adaptations?' + params.toString());
    const data = await res.json();
    const container = document.getElementById('adaptationCards');
    container.innerHTML = '';
    data.items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <span>${item.plant}</span>
                ${item.vegetable === 'Yes' ? '<span class="badge">🥕</span>' : ''}
            </div>
            <div class="card-body">${item.adaptations}</div>
        `;
        container.appendChild(card);
    });
}

async function loadComparisonTable(selectedPlants) {
    const params = buildQuery(selectedPlants, {});
    const res = await fetch('/api/compare?' + params.toString());
    const data = await res.json();
    const container = document.getElementById('comparisonTable');
    if (!data.plants.length) { container.innerHTML = '<em>Select plants to compare.</em>'; return; }
    const headers = data.display_names && data.display_names.length ? data.display_names : data.plants;
    let html = '<table class="table"><thead><tr><th>Trait</th>' + headers.map(p => `<th>${p}</th>`).join('') + '</tr></thead><tbody>';
    data.traits.forEach(tr => {
        html += `<tr><td>${tr}</td>` + data.plants.map(p => `<td>${data.values[p][tr] || ''}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

async function loadRadarChart(selectedPlants) {
    const params = buildQuery(selectedPlants, {});
    const res = await fetch('/api/radar?' + params.toString());
    const data = await res.json();
    if (!data.series.length) { Plotly.purge('radarChart'); return; }
    const traces = data.series.map(s => ({
        type: 'scatterpolar',
        r: s.values.concat(s.values[0]),
        theta: data.categories.concat(data.categories[0]),
        fill: 'toself',
        name: s.name
    }));
    Plotly.newPlot('radarChart', traces, {polar: {radialaxis: {visible: true, range: [0, 1]}}, showlegend: true, title: 'Trait Profile'});
}

async function loadClusterChart() {
    // Always use combined mode and auto k; use current filters
    const params = buildQuery(dashboard.selectedPlants, dashboard.filters);
    const res = await fetch(`/api/clusters?cluster_mode=combined&k=auto&${params.toString()}`);
    const data = await res.json();
    const summaryEl = document.getElementById('clusterSummary');
    if (!data.points || !data.points.length) {
        document.getElementById('clusterChart').innerHTML = '<em>No clustering results for current filters.</em>';
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }
    const clusters = {};
    data.points.forEach(p => {
        clusters[p.Cluster] = clusters[p.Cluster] || {x: [], y: [], text: [], name: `Cluster ${p.Cluster}`};
        clusters[p.Cluster].x.push(p.PCA1);
        clusters[p.Cluster].y.push(p.PCA2);
        clusters[p.Cluster].text.push(p.Label || p.Plant);
    });
    const traces = Object.values(clusters).map(c => ({...c, mode: 'markers', type: 'scatter'}));
    Plotly.newPlot('clusterChart', traces, {title: 'PCA Clusters (auto)'});

    // No summary rendering in original UI
    const title = data.meta && data.meta.basis_title ? `PCA Clusters — ${data.meta.basis_title} (k=${data.meta.k})` : 'PCA Clusters';
    Plotly.newPlot('clusterChart', traces, {title});

    if (summaryEl && data.summaries) {
        const items = Object.keys(data.summaries)
            .sort((a,b) => Number(a) - Number(b))
            .map(k => {
                const s = data.summaries[k];
                return `<div class="summary-item"><strong>C${k}</strong> — n=${s.size}; ` +
                    `GF: ${s['Growth Form']}; RT: ${s['Root Type']}; ST: ${s['Stress Tolerance']}; Usage: ${s['Primary Usage']}</div>`;
            }).join('');
        summaryEl.innerHTML = `<div class="summary-title">Cluster summaries</div>${items}`;
    }
}

async function loadParallelCats() {
    const params = buildQuery(dashboard.selectedPlants, dashboard.filters);
    const res = await fetch('/api/parallel-categories?' + params.toString());
    const data = await res.json();
    if (!data || !data.dimensions || !data.dimensions.length) {
        document.getElementById('parallelCatsChart').innerHTML = '<em>No data available.</em>';
        return;
    }
    const trace = [{
        type: 'parcats',
        dimensions: data.dimensions,
        line: { color: data.cluster_labels || [], colorscale: 'Viridis' },
        arrangement: 'perpendicular',
        bundlecolors: true
    }];
    const title = data.title || 'Traits Parallel Categories';
    Plotly.newPlot('parallelCatsChart', trace, {title});
}

async function loadVegetableChart() {
    const res = await fetch('/api/usage');
    const data = await res.json();
    const counts = data.usage_counts || {};
    Plotly.newPlot('usageChart', [{
        type: 'pie',
        labels: Object.keys(counts),
        values: Object.values(counts)
    }], {title: 'Usage Distribution'});
}

// Optional charts toggles
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    const toggle = btn.getAttribute('data-toggle');
    if (toggle === 'wordcloud') {
        const el = document.getElementById('wordCloudChart');
        const nowVisible = el.style.display === 'none';
        el.style.display = nowVisible ? 'block' : 'none';
        if (nowVisible) {
            setTimeout(async () => {
                await loadWordCloud(dashboard.selectedPlants, dashboard.filters);
            }, 50);
        }
    } else if (toggle === 'sankey') {
        const el = document.getElementById('sankeyChart');
        const nowVisible = el.style.display === 'none';
        el.style.display = nowVisible ? 'block' : 'none';
        if (nowVisible) {
            setTimeout(async () => {
                await loadSankey(dashboard.selectedPlants, dashboard.filters);
            }, 50);
        }
    }
});

async function loadWordCloud(selectedPlants, filters) {
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/wordcloud?' + params.toString());
    const data = await res.json();
    Plotly.newPlot('wordCloudChart', [{
        type: 'bar',
        x: data.terms,
        y: data.counts
    }], {title: 'Adaptations Term Frequencies'});
}

async function loadSankey(selectedPlants, filters) {
    const params = buildQuery(selectedPlants, filters);
    const res = await fetch('/api/sankey?' + params.toString());
    const data = await res.json();
    if (!data.nodes || !data.nodes.length || !data.links || !data.links.source || !data.links.source.length) {
        document.getElementById('sankeyChart').innerHTML = '<em>No Sankey data available for current filters.</em>';
        return;
    }
    const trace = {
        type: 'sankey',
        node: { label: data.nodes, pad: 12, thickness: 12 },
        link: data.links,
        domain: { x: [0, 1], y: [0, 1] }
    };
    Plotly.newPlot('sankeyChart', [trace], {title: 'Stress → Adaptations → Plants', margin: {l: 10, r: 10, t: 40, b: 10}});
}

// Similarity suggestions
async function updateSimilarSuggestions() {
    const container = document.getElementById('similarPlants');
    if (!dashboard.selectedPlants.length) { container.innerHTML = ''; return; }
    const last = dashboard.selectedPlants[dashboard.selectedPlants.length - 1];
    const res = await fetch('/api/similar?plant=' + encodeURIComponent(last));
    const data = await res.json();
    const label = (window.PLANT_INDEX && window.PLANT_INDEX[last]) || last;
    container.innerHTML = '<strong>Similar to ' + label + ':</strong> ' +
        data.similar.map(it => `<a href="#" data-plant="${it.id}" class="similar-item">${it.text}</a>`).join(', ');
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('.similar-item');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('data-plant');
    const compare = $('#compareSelect');
    if (!compare.find(`option[value="${id}"]`).length) {
        const text = (window.PLANT_INDEX && window.PLANT_INDEX[id]) || id;
        const newOption = new Option(text, id, true, true);
        compare.append(newOption).trigger('change');
    } else {
        const values = compare.val() || [];
        if (!values.includes(id)) {
            compare.val(values.concat(id)).trigger('change');
        }
    }
});

// Refresh similarity list whenever selection changes
const _origUpdateSelectedPlants = dashboard.updateSelectedPlants.bind(dashboard);
dashboard.updateSelectedPlants = (plants) => {
    _origUpdateSelectedPlants(plants);
    updateSimilarSuggestions();
};

// Responsive: resize charts on window resize
window.addEventListener('resize', () => {
    ['rootTypeChart','sunburstChart','stressBarChart','sankeyChart','radarChart','clusterChart','parallelCatsChart','usageChart','wordCloudChart']
.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        try {
            Plotly.Plots.resize(el);
        } catch (e) {
            console.error(`Error resizing ${id}:`, e);
        }
    }
});

});

// Filters
class FiltersManager {
    constructor() {
        this.init();
    }
    async init() {
        const res = await fetch('/api/filter-options');
        const data = await res.json();
        this.applySelect('#filterRootSystem', data.root_systems);
        this.applySelect('#filterRootDepth', data.root_depths);
        this.applySelect('#filterGrowth', data.growth_forms);
        this.applySelect('#filterStress', data.stress_tolerances);
        this.applySelect('#filterUsage', data.usage);
    }
    applySelect(selector, items) {
        const el = $(selector);
        const options = (items || []).map(v => ({ id: v, text: v }));
        el.select2({ placeholder: 'Any', width: '100%', data: options });
        el.on('change', () => {
            dashboard.filters = {
                root_system: $('#filterRootSystem').val() || [],
                root_depth: $('#filterRootDepth').val() || [],
                growth_form: $('#filterGrowth').val() || [],
                stress_tolerance: $('#filterStress').val() || [],
                usage: $('#filterUsage').val() || []
            };
            dashboard.refreshAllCharts();
            // If advanced is open, refresh advanced visuals too
            const wrap = document.getElementById('advancedAnalytics');
            if (wrap && wrap.style.display !== 'none') {
                loadParallelCats();
            }
            // Always update clusters and usage pie and filtered names
            loadClusterChart();
            loadVegetableChart();
            updateFilteredList();
        });
    }
}

// Initialize everything on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    LoadingManager.show();
    new UIManager();
    new PlantSelector();
    new FiltersManager();
    dashboard.refreshAllCharts();
    // Initial renders for clusters, usage pie and filtered list
    loadClusterChart();
    loadVegetableChart();
    updateFilteredList();
    setTimeout(() => LoadingManager.hide(), 500); // Ensure loading overlay is visible briefly
});

async function updateFilteredList() {
    try {
        const params = buildQuery(dashboard.selectedPlants, dashboard.filters);
        const res = await fetch('/api/filtered-plants?' + params.toString());
        const data = await res.json();
        const list = document.getElementById('filteredList');
        const anyFilters = (
            (dashboard.selectedPlants && dashboard.selectedPlants.length > 0) ||
            (dashboard.filters && (
                (dashboard.filters.root_system || []).length ||
                (dashboard.filters.root_depth || []).length ||
                (dashboard.filters.growth_form || []).length ||
                (dashboard.filters.stress_tolerance || []).length ||
                (dashboard.filters.usage || []).length
            ))
        );
        if (!anyFilters) {
            list.innerHTML = '<em>Select filters to see matching plants.</em>';
            return;
        }
        if (!data.names || !data.names.length) {
            list.innerHTML = '<em>No plants match current filters.</em>';
            return;
        }
        list.innerHTML = data.names.map(n => `<div class="list-item">${n}</div>`).join('');
    } catch (e) {
        console.error('Failed to update filtered list', e);
    }
}
