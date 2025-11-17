// server.js

const express = require("express");
const app = express();
const PORT = process.env.PORT || 80;

// Allow JSON data from ESP32
app.use(express.json());

// Store distances here
let espData = {
  "ESP32-A": "No data",
  "ESP32-B": "No data",
  "ESP32-C": "No data"
};

// Endpoint for ESP32 to send data
app.post("/update", (req, res) => {
  const { id, distance } = req.body;
  if (id && espData.hasOwnProperty(id)) {
    espData[id] = distance !== -1 ? `${distance} m` : "Not Found";
    console.log(`[${new Date().toISOString()}] from ${req.ip} -> [${id}] Distance: ${espData[id]}`);
    res.status(200).send("Data received");
  } else {
    res.status(400).send("Invalid ID or data");
  }
});

const parseDistanceMeters = (value) => {
  if (!value || value === "No data" || value === "Not Found") return null;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

// Webpage to display distances
app.get("/", (req, res) => {
  const entries = Object.entries(espData);
  const closest = entries.reduce((best, [id, label]) => {
    const meters = parseDistanceMeters(label);
    if (meters === null) return best;
    if (!best || meters < best.distance) {
      return { id, distance: meters };
    }
    return best;
  }, null);

  let html = `
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        padding: 24px;
        font-family: "Inter", "SF Pro Display", system-ui, -apple-system, sans-serif;
        background: radial-gradient(circle at top, #0f172a 0%, #020617 60%);
        color: #f8fafc;
      }
      h2 {
        margin: 0 0 16px;
      }
      .layout {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: stretch;
      }
      .card {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(2, 6, 23, 0.7);
        min-width: 320px;
        flex: 1 1 320px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th {
        text-align: left;
        font-size: 12px;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      th, td {
        padding: 12px 8px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      }
      tr:last-child td {
        border-bottom: none;
      }
      tr.highlight td {
        background: rgba(56, 189, 248, 0.08);
        border-color: rgba(56, 189, 248, 0.4);
      }
      .closest-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        background: #38bdf8;
        color: #0f172a;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .closest-distance {
        font-size: 42px;
        font-weight: 700;
        margin: 20px 0 8px;
      }
      .no-data {
        color: #fbbf24;
        font-weight: 600;
      }
    </style>
    <div class="layout">
      <div class="card">
        <h2>📡 ESP32 BLE Distance Monitor</h2>
        <table>
          <tr><th>ESP32 ID</th><th>Distance</th></tr>`;

  for (const [id, distance] of entries) {
    const isClosest = closest && closest.id === id;
    html += `<tr class="${isClosest ? "highlight" : ""}"><td>${id}</td><td>${distance}</td></tr>`;
  }

  html += `
        </table>
      </div>
      <div class="card" style="max-width: 360px;">
        <div class="closest-chip">Closest Device</div>
        <div style="margin-top:16px;">
  `;

  if (closest) {
    html += `
          <h3 style="margin:0; font-size: 20px; color:#bae6fd;">${closest.id}</h3>
          <div class="closest-distance">${closest.distance.toFixed(2)} m</div>
          <p style="margin:0; color:#94a3b8;">This is currently the nearest ESP32 to the target UUID.</p>
    `;
  } else {
    html += `
          <p class="no-data">Waiting for valid readings...</p>
          <p style="color:#94a3b8;">Once an ESP32 detects the target, the closest device will appear here.</p>
    `;
  }

  html += `
        </div>
      </div>
    </div>
  `;

  res.send(html);
});

// Start the server (bind on all interfaces for LAN access)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}/ or http://<LAN-IP>:${PORT}/ in your browser`);
});
