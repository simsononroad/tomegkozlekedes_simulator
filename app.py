"""Public Transport Manager - Flask backend.
Indítás:  pip install -r requirements.txt  &&  python app.py  ->  http://127.0.0.1:5000
"""
import json, time, urllib.request
from flask import Flask, jsonify, render_template

app = Flask(__name__)
_cache = {"t": 0, "data": None}
TTL = 3600  # az árfolyamot óránként frissítjük

SOURCES = [
    ("Európai Központi Bank (Frankfurter)", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=HUF",
     lambda j: (j["rates"]["HUF"], j["date"])),
    ("open.er-api.com", "https://open.er-api.com/v6/latest/EUR",
     lambda j: (j["rates"]["HUF"], j["time_last_update_utc"][:16])),
]

def fetch_rate():
    for name, url, parse in SOURCES:
        try:
            with urllib.request.urlopen(url, timeout=6) as r:
                rate, date = parse(json.load(r))
            return {"rate": float(rate), "source": name, "date": date, "live": True}
        except Exception:
            continue
    return {"rate": 390.0, "source": "tartalék érték (nincs hálózat)", "date": "", "live": False}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/rate")
def rate():
    if not _cache["data"] or time.time() - _cache["t"] > TTL:
        data = fetch_rate()
        if data["live"] or not _cache["data"]:
            _cache.update(t=time.time(), data=data)
    return jsonify(_cache["data"])

if __name__ == "__main__":
    app.run(debug=True)
