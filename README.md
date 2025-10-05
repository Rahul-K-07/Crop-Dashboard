# 🌿 Unified Plant Traits Dashboard

An interactive **Flask + Plotly** web app for exploring, comparing, and clustering **plant species traits**.  
Built to help researchers and students analyze morphological and functional plant characteristics using modern data visualization and simple ML techniques.

---

## 🚀 Overview

The dashboard loads a CSV of plant data, normalizes it, applies **PCA** and **KMeans clustering**, and exposes a REST API for the frontend.  
Users can filter, compare, and visualize species by traits like **root type, stress tolerance, growth form**, and **special adaptations**.

### ✨ Key Features
- Interactive visualizations (Bar, Sunburst, Sankey, Radar, PCA Scatter, Network)
- Dynamic filters and live updates
- Plant comparison and similarity search
- Clustered PCA view for trait-based grouping
- Fully responsive single-page dashboard

---

## 🧠 Tech Stack

**Backend:** Flask · pandas · scikit-learn  
**Frontend:** Plotly.js · jQuery · Select2 · HTML/CSS/JS  
**Data:** `Crop_dashboard Kerala.csv`

---

## ⚙️ How It Works

1. Loads and preprocesses the dataset.  
2. Encodes categorical traits numerically.  
3. Performs 2D PCA projection and KMeans clustering.  
4. Serves JSON APIs for visual analytics.  
5. Renders charts and comparisons interactively in the browser.

---

## 🧮 Machine Learning Insights
- **Label Encoding** of plant traits  
- **PCA (2D)** for visualizing relationships  
- **KMeans Clustering** for grouping similar species  
- **Similarity Search** based on Euclidean distance  

> Designed for exploratory analysis rather than precise taxonomy.

---

## 🖥️ Run Locally

```bash
git clone https://github.com/Rahul-K-07/Crop-Dashboard.git
cd Crop-Dashboard
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
