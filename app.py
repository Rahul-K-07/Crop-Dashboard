import math
import re
from collections import Counter, defaultdict

import pandas as pd
from flask import Flask, render_template, request, jsonify
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.preprocessing import LabelEncoder

app = Flask(__name__)


# ------------------------------
# Data loading and normalization
# ------------------------------
def _normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    # Standardize column names (strip and collapse spaces)
    frame.columns = [c.strip() for c in frame.columns]

    # Ensure expected columns exist (new dataset splits Root and Type and includes usage flags)
    expected = [
        'Plant',
        'Root',
        'Type',
        'Stem / Growth Form',
        'Leaf Traits',
        'Reproductive Traits',
        'Stress Tolerance',
        'Special Adaptations',
        'Vegetable',
        'Fruit',
        'Medicinal Plant',
        'Commercial Crop',
        'Ornamental Plant',
    ]
    for col in expected:
        if col not in frame.columns:
            frame[col] = 'Unknown'

    # Normalize whitespace and missing values
    for col in expected + [c for c in frame.columns if 'Vegetable' in c]:
        frame[col] = (
            frame[col]
            .astype(str)
            .fillna('Unknown')
            .str.strip()
            .replace({'': 'Unknown'})
        )

    # Create a consistent vegetable flag
    veg_source_col = 'Vegetable'
    if 'Vegetable (Yes/No)' in frame.columns:
        veg_source_col = 'Vegetable (Yes/No)'
    elif 'Vegetable' in frame.columns:
        veg_source_col = 'Vegetable'
    else:
        frame['Vegetable'] = 'Unknown'
        veg_source_col = 'Vegetable'

    def _to_yes_no(val: str) -> str:
        v = (val or '').strip().lower()
        if v in {'y', 'yes', 'true', '1'}:
            return 'Yes'
        if v in {'n', 'no', 'false', '0'}:
            return 'No'
        # Treat any non-empty text as Yes; Unknown/empty as No
        if v and v != 'unknown':
            return 'Yes'
        return 'No'

    frame['VegetableFlag'] = frame[veg_source_col].apply(_to_yes_no)

    # Build Usage tags from boolean columns when present
    def _to_bool(val: str) -> bool:
        v = (val or '').strip().lower()
        return v in {'1', 'y', 'yes', 'true'}

    usage_tags = []
    for _, row in frame.iterrows():
        tags = []
        try:
            if _to_bool(str(row.get('Vegetable', '0'))):
                tags.append('Vegetable')
            if _to_bool(str(row.get('Fruit', '0'))):
                tags.append('Fruits')
            if _to_bool(str(row.get('Medicinal Plant', '0'))):
                tags.append('Medicinal')
            if _to_bool(str(row.get('Commercial Crop', '0'))):
                tags.append('Commercial')
            if _to_bool(str(row.get('Ornamental Plant', '0'))):
                tags.append('Ornamental')
        except Exception:
            tags = []
        usage_tags.append(tags)
    frame['UsageTags'] = usage_tags
    frame['Usage'] = frame['UsageTags'].apply(lambda tags: '; '.join(tags) if tags else 'Unknown')

    return frame


df = pd.read_csv('Crop_dashboard Kerala.csv').fillna('Unknown')
df = _normalize_columns(df)


# ------------------------------
# Helpers and precomputations
# ------------------------------
def get_plant_category(row: pd.Series) -> str:
    stem = str(row.get('Stem / Growth Form', 'Unknown')).lower()
    if 'tree' in stem:
        return 'Tree'
    if 'shrub' in stem:
        return 'Shrub'
    if 'herb' in stem:
        return 'Herb'
    if 'vine' in stem or 'climber' in stem:
        return 'Vine'
    return 'Other'


def _parse_list_arg(arg_name: str) -> list:
    values = request.args.getlist(f'{arg_name}[]')
    if not values:
        raw = request.args.get(arg_name, '')
        if raw:
            values = [v.strip() for v in raw.split(',') if v.strip()]
    return values


def apply_filters(source: pd.DataFrame) -> pd.DataFrame:
    filtered = source

    selected_plants = _parse_list_arg('plants')
    if selected_plants:
        filtered = filtered[filtered['Plant'].isin(selected_plants)]

    roots = _parse_list_arg('root')
    if roots:
        filtered = filtered[filtered['Root'].isin(roots)]

    types = _parse_list_arg('type')
    if types:
        filtered = filtered[filtered['Type'].isin(types)]

    growth_forms = _parse_list_arg('growth_form')
    if growth_forms:
        filtered = filtered[filtered['Stem / Growth Form'].isin(growth_forms)]

    stress_tolerances = _parse_list_arg('stress_tolerance')
    if stress_tolerances:
        filtered = filtered[filtered['Stress Tolerance'].isin(stress_tolerances)]

    vegetables = _parse_list_arg('vegetable')
    if vegetables:
        filtered = filtered[filtered['VegetableFlag'].isin(vegetables)]

    usage_vals = _parse_list_arg('usage')
    if usage_vals:
        wanted = {u.strip().lower() for u in usage_vals}
        def any_usage(tags):
            return any((t.lower() in wanted) for t in (tags or []))
        filtered = filtered[filtered['UsageTags'].apply(any_usage)]

    return filtered


# Precompute filter options and plant list
FILTER_OPTIONS = {
    'roots': sorted(df['Root'].dropna().unique().tolist()),
    'types': sorted(df['Type'].dropna().unique().tolist()),
    'growth_forms': sorted(df['Stem / Growth Form'].dropna().unique().tolist()),
    'stress_tolerances': sorted(df['Stress Tolerance'].dropna().unique().tolist()),
    'vegetable': ['Yes', 'No'],
    'usage': ['Vegetable', 'Fruits', 'Commercial', 'Medicinal', 'Ornamental'],
}

PLANT_LIST = [
    {
        'name': row['Plant'],
        'category': get_plant_category(row),
        'vegetable': row['VegetableFlag'],
    }
    for _, row in df.iterrows()
]

CATEGORY_MAPPINGS: dict[str, list] = {}
for plant in PLANT_LIST:
    CATEGORY_MAPPINGS.setdefault(plant['category'], []).append(plant)
    if plant['vegetable'] == 'Yes':
        CATEGORY_MAPPINGS.setdefault('Edible', []).append(plant)
    # Drought tolerant grouping
    plant_row = df.loc[df['Plant'] == plant['name']]
    if not plant_row.empty:
        stress_val = str(plant_row.iloc[0]['Stress Tolerance']).lower()
        if 'drought' in stress_val:
            CATEGORY_MAPPINGS.setdefault('Drought Tolerant', []).append(plant)


# Encoders and clustering
TRAIT_COLS = [
    'Root',
    'Type',
    'Stem / Growth Form',
    'Leaf Traits',
    'Reproductive Traits',
    'Stress Tolerance',
    'Special Adaptations',
    'VegetableFlag',
]

# Ensure string dtype for encoders
_encoded_input = df[TRAIT_COLS].astype(str)
ENCODERS = {col: LabelEncoder().fit(_encoded_input[col]) for col in TRAIT_COLS}
ENCODED = pd.DataFrame({col: ENCODERS[col].transform(_encoded_input[col]) for col in TRAIT_COLS})

pca = PCA(n_components=2, random_state=42)
pca_result = pca.fit_transform(ENCODED)
kmeans = KMeans(n_clusters=5, random_state=42)
kmeans.fit(ENCODED)

df['PCA1'], df['PCA2'] = pca_result[:, 0], pca_result[:, 1]
df['Cluster'] = kmeans.labels_


# ------------------------------
# Routes
# ------------------------------
@app.route('/')
def dashboard():
    return render_template('dashboard.html')


@app.route('/api/filter-options')
def filter_options():
    return jsonify(FILTER_OPTIONS)


@app.route('/api/plant-list')
def plant_list():
    return jsonify(PLANT_LIST)


@app.route('/api/plant-search')
def plant_search():
    q = request.args.get('q', '').lower()
    results = [plant for plant in PLANT_LIST if q in plant['name'].lower()]
    return jsonify(results[:10])


@app.route('/api/plants-by-category')
def plants_by_category():
    category = request.args.get('category', '')
    return jsonify(CATEGORY_MAPPINGS.get(category, []))


@app.route('/api/traits')
def get_traits():
    filtered = apply_filters(df)
    root_counts = filtered['Root'].value_counts().to_dict()
    return jsonify({'root_counts': root_counts})


@app.route('/api/wordcloud')
def get_wordcloud():
    filtered = apply_filters(df)
    # Tokenize special adaptations by words and semicolons
    text = ' '.join(filtered['Special Adaptations'].astype(str).tolist()).lower()
    # Split by non-word or semicolons/commas
    tokens = [t for t in re.split(r"[^a-zA-Z0-9]+", text) if len(t) > 2 and t != 'unknown']
    counts = Counter(tokens)
    top = counts.most_common(50)
    return jsonify({'terms': [t for t, _ in top], 'counts': [c for _, c in top]})


@app.route('/api/sunburst')
def get_sunburst():
    filtered = apply_filters(df)
    labels = ['All']
    parents = ['']
    values = [len(filtered)]

    # Level 1: Growth Form
    gf_counts = filtered['Stem / Growth Form'].value_counts()
    gf_index = {}
    for gf, cnt in gf_counts.items():
        gf_index[gf] = len(labels)
        labels.append(str(gf))
        parents.append('All')
        values.append(int(cnt))

    # Level 2: Leaf Traits under each Growth Form
    grouped = (
        filtered.groupby(['Stem / Growth Form', 'Leaf Traits'])['Plant']
        .count()
        .reset_index(name='count')
    )
    lt_index = {}
    for _, row in grouped.iterrows():
        key = (row['Stem / Growth Form'], row['Leaf Traits'])
        lt_index[key] = len(labels)
        labels.append(str(row['Leaf Traits']))
        parents.append(str(row['Stem / Growth Form']))
        values.append(int(row['count']))

    # Level 3: Plants under each (GF, Leaf Trait)
    for _, row in filtered.iterrows():
        key = (row['Stem / Growth Form'], row['Leaf Traits'])
        parent_label = str(row['Leaf Traits'])
        labels.append(str(row['Plant']))
        parents.append(parent_label)
        values.append(1)

    return jsonify({'labels': labels, 'parents': parents, 'values': values})


@app.route('/api/stress')
def get_stress():
    filtered = apply_filters(df)
    stress_counts = filtered['Stress Tolerance'].value_counts().to_dict()
    return jsonify({'stress_counts': stress_counts})


@app.route('/api/adaptations')
def get_adaptations():
    filtered = apply_filters(df)
    records = []
    for _, row in filtered.iterrows():
        adaptations = str(row['Special Adaptations'])
        if adaptations and adaptations.lower() != 'unknown':
            records.append(
                {
                    'plant': row['Plant'],
                    'adaptations': adaptations,
                    'vegetable': row['VegetableFlag'],
                }
            )
    return jsonify({'items': records})


@app.route('/api/sankey')
def get_sankey():
    filtered = apply_filters(df)
    # Build nodes: stress categories, adaptation tokens, plants
    stress_values = sorted(filtered['Stress Tolerance'].dropna().unique().tolist())

    # Extract adaptation tokens
    def split_adaptations(text: str) -> list[str]:
        parts = re.split(r'[;,/]\s*', str(text))
        return [p.strip() for p in parts if p and p.lower() != 'unknown']

    adaptation_tokens = set()
    for val in filtered['Special Adaptations']:
        adaptation_tokens.update(split_adaptations(val))

    # Limit to avoid extremely large diagrams
    if len(adaptation_tokens) > 40:
        # Take top 40 by frequency
        counts = Counter(
            token for val in filtered['Special Adaptations'] for token in split_adaptations(val)
        )
        adaptation_tokens = set([t for t, _ in counts.most_common(40)])

    nodes = []
    index_map = {}

    # Add stress nodes
    for s in stress_values:
        index_map[('stress', s)] = len(nodes)
        nodes.append(str(s))

    # Add adaptation nodes
    for a in sorted(adaptation_tokens):
        index_map[('adapt', a)] = len(nodes)
        nodes.append(a)

    # Add plant nodes (limit total to 150 to keep diagram responsive)
    plants = filtered['Plant'].tolist()
    if len(plants) > 150:
        plants = plants[:150]
        filtered_subset = filtered[filtered['Plant'].isin(plants)]
    else:
        filtered_subset = filtered

    for p in plants:
        index_map[('plant', p)] = len(nodes)
        nodes.append(p)

    sources = []
    targets = []
    values = []

    for _, row in filtered_subset.iterrows():
        stress = row['Stress Tolerance']
        s_idx = index_map.get(('stress', stress))
        for a in split_adaptations(row['Special Adaptations']):
            if ('adapt', a) not in index_map:
                continue
            a_idx = index_map[('adapt', a)]
            p_idx = index_map.get(('plant', row['Plant']))
            # stress -> adaptation
            sources.append(s_idx)
            targets.append(a_idx)
            values.append(1)
            # adaptation -> plant
            sources.append(a_idx)
            targets.append(p_idx)
            values.append(1)

    return jsonify({'nodes': nodes, 'links': {'source': sources, 'target': targets, 'value': values}})


@app.route('/api/compare')
def compare_plants():
    selected = _parse_list_arg('plants')
    if not selected:
        return jsonify({'plants': [], 'traits': [], 'values': {}})
    rows = df[df['Plant'].isin(selected)]
    traits = [
        'Root',
        'Type',
        'Stem / Growth Form',
        'Leaf Traits',
        'Reproductive Traits',
        'Stress Tolerance',
        'Special Adaptations',
        'VegetableFlag',
    ]
    values = {plant: {} for plant in selected}
    for _, row in rows.iterrows():
        plant = row['Plant']
        for t in traits:
            values[plant][t] = str(row[t])
    return jsonify({'plants': selected, 'traits': traits, 'values': values})


@app.route('/api/radar')
def radar_data():
    selected = _parse_list_arg('plants')
    if not selected:
        return jsonify({'categories': [], 'series': []})
    # Normalize encoded values to [0,1] per trait
    categories = TRAIT_COLS
    encoded_rows = ENCODED.copy()
    encoded_rows['Plant'] = df['Plant']
    subset = encoded_rows[encoded_rows['Plant'].isin(selected)]
    maxima = {c: max(1, encoded_rows[c].max()) for c in TRAIT_COLS}
    series = []
    for plant in selected:
        prow = subset[subset['Plant'] == plant]
        if prow.empty:
            continue
        values = [float(prow.iloc[0][c]) / float(maxima[c]) for c in TRAIT_COLS]
        series.append({'name': plant, 'values': values})
    return jsonify({'categories': categories, 'series': series})


@app.route('/api/similar')
def similar_plants():
    plant = request.args.get('plant', '')
    if not plant or plant not in set(df['Plant'].tolist()):
        return jsonify({'similar': []})
    # Distance in encoded feature space (Euclidean)
    encoded_rows = ENCODED.copy()
    encoded_rows['Plant'] = df['Plant']
    target = encoded_rows[encoded_rows['Plant'] == plant].iloc[0]
    sims = []
    for _, row in encoded_rows.iterrows():
        other = row['Plant']
        if other == plant:
            continue
        dist = 0.0
        for c in TRAIT_COLS:
            d = float(row[c]) - float(target[c])
            dist += d * d
        sims.append((math.sqrt(dist), other))
    sims.sort(key=lambda x: x[0])
    return jsonify({'similar': [name for _, name in sims[:10]]})


@app.route('/api/network')
def trait_network():
    filtered = apply_filters(df)
    # Build bipartite graph: plants <-> traits (root type, growth form, stress, key adaptations)
    nodes = []
    node_index = {}

    def add_node(node_id: str, label: str, group: str):
        if node_id in node_index:
            return node_index[node_id]
        idx = len(nodes)
        node_index[node_id] = idx
        nodes.append({'id': node_id, 'label': label, 'group': group})
        return idx

    links = []

    # Collect top adaptation tokens to limit size
    def split_adaptations(text: str) -> list[str]:
        parts = re.split(r'[;,/]\s*', str(text))
        return [p.strip() for p in parts if p and p.lower() != 'unknown']

    adapt_counter = Counter(
        token for val in filtered['Special Adaptations'] for token in split_adaptations(val)
    )
    top_adapts = {t for t, _ in adapt_counter.most_common(30)}

    for _, row in filtered.iterrows():
        plant = row['Plant']
        p_idx = add_node(f'p::{plant}', plant, 'plant')
        traits = [
            ('rt::' + row['Root'], row['Root'], 'Root'),
            ('ty::' + row['Type'], row['Type'], 'Type'),
            ('gf::' + row['Stem / Growth Form'], row['Stem / Growth Form'], 'Growth Form'),
            ('st::' + row['Stress Tolerance'], row['Stress Tolerance'], 'Stress Tolerance'),
        ]
        for node_id, label, group in traits:
            t_idx = add_node(node_id, label, group)
            links.append({'source': p_idx, 'target': t_idx})

        for a in split_adaptations(row['Special Adaptations']):
            if a in top_adapts:
                a_idx = add_node('ad::' + a, a, 'Adaptation')
                links.append({'source': p_idx, 'target': a_idx})

    return jsonify({'nodes': nodes, 'links': links})


@app.route('/api/vegetables')
def get_vegetables():
    filtered = apply_filters(df)
    veg_counts = filtered['VegetableFlag'].value_counts().to_dict()
    return jsonify({'veg_counts': veg_counts})


@app.route('/api/clusters')
def get_clusters():
    filtered = apply_filters(df)
    points = filtered[['Plant', 'PCA1', 'PCA2', 'Cluster']].to_dict('records')
    return jsonify({'points': points})


if __name__ == '__main__':
    app.run(debug=True)
