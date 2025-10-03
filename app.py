import pandas as pd
from flask import Flask, render_template, request, jsonify
from sklearn.preprocessing import LabelEncoder
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans

app = Flask(__name__)

# Load and preprocess data
df = pd.read_csv('combined_traits_table.csv').fillna('Unknown')

# Helper: get plant category
def get_plant_category(row):
    stem = row.get('Stem / Growth Form', '').lower()
    if 'tree' in stem:
        return 'Tree'
    if 'shrub' in stem:
        return 'Shrub'
    if 'herb' in stem:
        return 'Herb'
    if 'vine' in stem:
        return 'Vine'
    return 'Other'

# Precompute/caching
FILTER_OPTIONS = {
    'root_types': sorted(df['Root Type'].unique()),
    'growth_forms': sorted(df['Stem / Growth Form'].unique()),
    'stress_tolerances': sorted(df['Stress Tolerance'].unique()),
    'vegetable': sorted(df['Vegetable (Yes/No)'].unique())
}
PLANT_LIST = [
    {
        "name": row["Plant"],
        "category": get_plant_category(row),
        "vegetable": row.get("Vegetable (Yes/No)", "No")
    }
    for _, row in df.iterrows()
]
CATEGORY_MAPPINGS = {}
for plant in PLANT_LIST:
    cat = plant["category"]
    CATEGORY_MAPPINGS.setdefault(cat, []).append(plant)
    if plant["vegetable"] == "Yes":
        CATEGORY_MAPPINGS.setdefault("Edible", []).append(plant)
    if "drought" in df.loc[df['Plant'] == plant["name"], "Stress Tolerance"].values[0].lower():
        CATEGORY_MAPPINGS.setdefault("Drought Tolerant", []).append(plant)

# Clustering
trait_cols = ['Root Type', 'Stem / Growth Form', 'Leaf Traits', 'Reproductive Traits', 'Stress Tolerance', 'Special Adaptations', 'Vegetable (Yes/No)']
encoders = {col: LabelEncoder().fit(df[col]) for col in trait_cols}
encoded = pd.DataFrame({col: encoders[col].transform(df[col]) for col in trait_cols})
pca = PCA(n_components=2)
pca_result = pca.fit_transform(encoded)
kmeans = KMeans(n_clusters=5, random_state=42).fit(encoded)
df['PCA1'], df['PCA2'] = pca_result[:,0], pca_result[:,1]
df['Cluster'] = kmeans.labels_

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
    results = [plant for plant in PLANT_LIST if q in plant["name"].lower()]
    return jsonify(results[:10])

@app.route('/api/plants-by-category')
def plants_by_category():
    category = request.args.get('category', '')
    return jsonify(CATEGORY_MAPPINGS.get(category, []))

@app.route('/api/traits')
def get_traits():
    selected = request.args.getlist('plants[]')
    filtered = df[df['Plant'].isin(selected)] if selected else df
    root_counts = filtered['Root Type'].value_counts().to_dict()
    return jsonify({'root_counts': root_counts})

@app.route('/api/stress')
def get_stress():
    selected = request.args.getlist('plants[]')
    filtered = df[df['Plant'].isin(selected)] if selected else df
    stress_counts = filtered['Stress Tolerance'].value_counts().to_dict()
    return jsonify({'stress_counts': stress_counts})

@app.route('/api/vegetables')
def get_vegetables():
    selected = request.args.getlist('plants[]')
    filtered = df[df['Plant'].isin(selected)] if selected else df
    veg_counts = filtered['Vegetable (Yes/No)'].value_counts().to_dict()
    return jsonify({'veg_counts': veg_counts})

@app.route('/api/clusters')
def get_clusters():
    selected = request.args.getlist('plants[]')
    filtered = df[df['Plant'].isin(selected)] if selected else df
    points = filtered[['Plant', 'PCA1', 'PCA2', 'Cluster']].to_dict('records')
    return jsonify({'points': points})

# ... (other endpoints for sunburst, word cloud, comparison, etc. as in the 3rd version)

if __name__ == '__main__':
    app.run(debug=True)
