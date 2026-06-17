import os
from flask import Flask, send_from_directory, jsonify, request

app = Flask(__name__, static_folder=None)

DIST_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")


# ── Static file serving ───────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(DIST_DIR, "index.html")


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(DIST_DIR, "assets"), filename)


@app.route("/<path:filename>")
def static_files(filename):
    filepath = os.path.join(DIST_DIR, filename)
    if os.path.isfile(filepath):
        return send_from_directory(DIST_DIR, filename)
    # SPA fallback — let React Router handle unknown paths
    return send_from_directory(DIST_DIR, "index.html")


# ── /calculate ────────────────────────────────────────────────────────────────

@app.route("/calculate", methods=["POST", "OPTIONS"])
def calculate():
    # Handle CORS pre-flight (useful during local dev behind proxies)
    if request.method == "OPTIONS":
        response = jsonify({})
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        return response, 204

    data = request.get_json(force=True) or {}

    try:
        battery_capacity = float(data.get("battery_capacity", 0))
        start_pct        = float(data.get("start_pct",        0))
        target_pct       = float(data.get("target_pct",       0))
        current_kw       = float(data.get("current_kw",       0))
        energy_charged   = float(data.get("energy_charged",   0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid input values"}), 400

    # Validate ranges
    if battery_capacity <= 0:
        return jsonify({"error": "Battery capacity must be positive"}), 400
    if not (0 <= start_pct <= 100) or not (0 <= target_pct <= 100):
        return jsonify({"error": "SoC values must be between 0 and 100"}), 400
    if current_kw < 0:
        return jsonify({"error": "Charging power cannot be negative"}), 400
    if energy_charged < 0:
        return jsonify({"error": "Energy charged cannot be negative"}), 400

    # Invalid SoC range
    if start_pct >= target_pct:
        return jsonify({
            "status":                "invalid_range",
            "time_remaining_seconds": 0,
            "energy_remaining":       0,
            "total_energy_needed":    0,
        })

    total_energy_needed = battery_capacity * ((target_pct - start_pct) / 100.0)
    energy_remaining    = total_energy_needed - energy_charged

    # Already done
    if energy_remaining <= 0:
        return jsonify({
            "status":                "complete",
            "time_remaining_seconds": 0,
            "energy_remaining":       0,
            "total_energy_needed":    round(total_energy_needed, 2),
        })

    # Charger paused / off
    if current_kw == 0:
        return jsonify({
            "status":                "paused",
            "time_remaining_seconds": None,
            "energy_remaining":       round(energy_remaining, 2),
            "total_energy_needed":    round(total_energy_needed, 2),
        })

    time_remaining_seconds = (energy_remaining / current_kw) * 3600

    return jsonify({
        "status":                "charging",
        "time_remaining_seconds": round(time_remaining_seconds),
        "energy_remaining":       round(energy_remaining, 2),
        "total_energy_needed":    round(total_energy_needed, 2),
    })


# ── /health ───────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
