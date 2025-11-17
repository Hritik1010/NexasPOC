// server.js

const express = require("express");
const { kv } = require("@vercel/kv");

const PORT = process.env.PORT || 80;
const KV_KEY = process.env.KV_KEY || "esp32-distance";
const useKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const DEFAULT_ESP_DATA = {
  "ESP32-A": "No data",
  "ESP32-B": "No data",
  "ESP32-C": "No data",
};

const LOCATION_LABELS = {
  "ESP32-A": "Shop 1",
  "ESP32-B": "Shop 2",
  "ESP32-C": "Shop 3",
};

const espData = { ...DEFAULT_ESP_DATA };
const sseClients = new Set();

const parseDistanceMeters = (value) => {
  if (!value || value === "No data" || value === "Not Found") return null;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const findClosest = (entries) => {
  return entries.reduce((best, [id, label]) => {
    const meters = parseDistanceMeters(label);
    if (meters === null) return best;
    if (!best || meters < best.distance) {
      return { id, distance: meters };
    }
    return best;
  }, null);
};

const statusForDevice = (id, label, closest) => {
  const location = LOCATION_LABELS[id] || id;
  const meters = parseDistanceMeters(label);
  if (!closest || !meters) {
    return "-";
  }
  if (closest.id === id) {
    return `You are near ${location}`;
  }
  return "-";
};

const readStoreSnapshot = async () => {
  if (useKV) {
    const remote = await kv.hgetall(KV_KEY);
    return { ...DEFAULT_ESP_DATA, ...(remote || {}) };
  }
  return { ...espData };
};

const writeStoreValue = async (id, value) => {
  espData[id] = value;
  if (useKV) {
    await kv.hset(KV_KEY, { [id]: value });
  }
};

const buildStatusRows = async () => {
  const snapshot = await readStoreSnapshot();
  const entries = Object.entries(snapshot);
  const closest = findClosest(entries);
  return entries.map(([id, distance]) => {
    const isClosest = closest && closest.id === id;
    const location = LOCATION_LABELS[id] || id;
    const status = statusForDevice(id, distance, closest);
    return { id, location, status, highlight: Boolean(isClosest) };
  });
};

const renderRowsHtml = (rows) => {
  return rows
    .map(
      ({ id, location, status, highlight }) =>
        `<tr class="${highlight ? "highlight" : ""}"><td><span class="location">${location}</span><div>${id}</div></td><td class="status">${status}</td></tr>`
    )
    .join("");
};

const renderDashboard = async () => {
  const rows = await buildStatusRows();

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
      .card {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(2, 6, 23, 0.7);
        max-width: 720px;
        margin: 0 auto;
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
        background: rgba(34, 197, 94, 0.08);
        border-color: rgba(34, 197, 94, 0.4);
      }
      .location {
        display: block;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .status {
        font-weight: 600;
        color: #e2e8f0;
      }
    </style>
    <div class="card">
      <h2>🛰️ Room Proximity Status Monitor</h2>
      <table>
        <thead>
          <tr><th>Location</th><th>Status</th></tr>
        </thead>
        <tbody id="status-body">
          ${renderRowsHtml(rows)}
        </tbody>
      </table>
    </div>
    <script>
      const renderRows = (rows) => rows.map(row =>
        '<tr class="' + (row.highlight ? 'highlight' : '') + '"><td><span class="location">' +
        row.location + '</span><div>' + row.id + '</div></td><td class="status">' + row.status + '</td></tr>'
      ).join('');

      const applyRows = (rows) => {
        const body = document.getElementById('status-body');
        if (body && Array.isArray(rows)) {
          body.innerHTML = renderRows(rows);
        }
      };

      function startStream() {
        const source = new EventSource('/events');
        source.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            applyRows(payload.rows);
          } catch (err) {
            console.error('Parse error', err);
          }
        };
        source.onerror = () => {
          source.close();
          setTimeout(startStream, 3000);
        };
      }

      startStream();
    </script>
  `;

  return html;
};

const createApp = () => {
  const app = express();
  app.use(express.json());

  app.post("/update", async (req, res, next) => {
    const { id, distance } = req.body;
    if (id && Object.prototype.hasOwnProperty.call(espData, id)) {
      try {
        const label = distance !== -1 ? `${distance} m` : "Not Found";
        await writeStoreValue(id, label);
        console.log(
          `[${new Date().toISOString()}] from ${req.ip} -> [${id}] Distance: ${label}`
        );
        await broadcastStatus();
        res.status(200).send("Data received");
      } catch (err) {
        next(err);
      }
    } else {
      res.status(400).send("Invalid ID or data");
    }
  });

  app.get("/", async (req, res, next) => {
    try {
      const html = await renderDashboard();
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  app.get("/status", async (req, res, next) => {
    try {
      const rows = await buildStatusRows();
      res.json({ rows, updatedAt: Date.now() });
    } catch (err) {
      next(err);
    }
  });

  app.get("/events", async (req, res, next) => {
    try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    sseClients.add(res);
      const rows = await buildStatusRows();
      res.write(`data: ${JSON.stringify({ rows, updatedAt: Date.now() })}\n\n`);

      req.on("close", () => {
        sseClients.delete(res);
      });
    } catch (err) {
      next(err);
    }
  });

  return app;
};

const app = createApp();

async function broadcastStatus() {
  if (!sseClients.size) return;
  const rows = await buildStatusRows();
  const payload = `data: ${JSON.stringify({ rows, updatedAt: Date.now() })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT}/ or http://<LAN-IP>:${PORT}/ in your browser`);
  });
}

module.exports = app;
