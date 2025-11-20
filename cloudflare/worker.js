const STORE_KEY = "esp32-distance";

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const renderRowsHtml = (rows) => {
  return rows
    .map(
      ({ id, location, status, highlight }) =>
        `<tr class="${highlight ? "highlight" : ""}"><td><span class="location">${location}</span><div>${id}</div></td><td class="status">${status}</td></tr>`
    )
    .join("");
};

const renderDashboard = async (env) => {
  const rows = await buildStatusRows(env);

  return `
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
};

const readStoreSnapshot = async (env) => {
  const fromKv = await env.ESP_DATA.get(STORE_KEY, { type: "json" });
  return { ...DEFAULT_ESP_DATA, ...(fromKv || {}) };
};

const writeStoreValue = async (env, id, value) => {
  const snapshot = await readStoreSnapshot(env);
  snapshot[id] = value;
  await env.ESP_DATA.put(STORE_KEY, JSON.stringify(snapshot));
  return snapshot;
};

const buildStatusRows = async (env) => {
  const snapshot = await readStoreSnapshot(env);
  const entries = Object.entries(snapshot);
  const closest = findClosest(entries);
  return entries.map(([id, distance]) => {
    const isClosest = closest && closest.id === id;
    const location = LOCATION_LABELS[id] || id;
    const status = statusForDevice(id, distance, closest);
    return { id, location, status, highlight: Boolean(isClosest) };
  });
};

const buildStatusPayload = async (env) => {
  const rows = await buildStatusRows(env);
  return { rows, updatedAt: Date.now() };
};

const handleUpdate = async (request, env) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id, distance } = body || {};
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_ESP_DATA, id)) {
    return new Response("Invalid ID", { status: 400 });
  }

  const label = distance !== -1 ? `${distance} m` : "Not Found";
  await writeStoreValue(env, id, label);

  return new Response("Data received", { status: 200 });
};

const handleStatus = async (env) => {
  const payload = await buildStatusPayload(env);
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
};

const handleDashboard = async (env) => {
  const html = await renderDashboard(env);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

const handleEvents = async (env) => {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      async function pushLoop() {
        while (!closed) {
          const payload = await buildStatusPayload(env);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
          await wait(5000);
        }
      }

      pushLoop().catch((err) => controller.error(err));
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/update") {
      return handleUpdate(request, env);
    }

    if (path === "/status") {
      return handleStatus(env);
    }

    if (path === "/events") {
      return handleEvents(env);
    }

    if (path === "/") {
      return handleDashboard(env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
