# Nexas Proximity Monitor

BLE-based room proximity display powered by ESP32 scanners and a Node/Express server.

## Local development

```bash
npm install
PORT=3000 node server.js
```

Open `http://localhost:3000/` to see the live status table. ESP32 devices should post to `http://<your-ip>:3000/update`.

## Deploying to Render

Render keeps a Node service alive 24/7, which matches the in-memory store this server now uses. There are two ways to deploy:

### Using the Render dashboard

1. Push this repo to GitHub (or another Git provider Render supports).
2. In Render, create a **Web Service** and connect it to the repo.
3. Use these settings:
	- **Runtime:** Node
	- **Build command:** `npm install`
	- **Start command:** `npm start`
	- **Instance type:** Free (or higher if you need more uptime)
4. Render automatically sets `PORT`. Leave it untouched and make sure the ESP32 points to `https://<your-service>.onrender.com/update` once the deploy is live.

### Using the included `render.yaml`

Render Blueprints let you spin up the service from infrastructure-as-code:

```bash
render blueprint install
```

Review `render.yaml` to adjust the service name, region, or plan before running the command. Render provisions everything with the same build/start commands described above.

## Deploying to Cloudflare Workers

Cloudflare Workers keep your API close to your ESP32 devices globally, and the new `cloudflare/worker.js` mirror of the Express server makes deployment straightforward.

1. Install and authenticate the CLI:
	```bash
	npm install -g wrangler
	wrangler login
	```
2. Create KV namespaces for production and preview:
	```bash
	wrangler kv:namespace create esp_data
	wrangler kv:namespace create esp_data --preview
	```
   Copy the returned IDs into `wrangler.toml` under the `ESP_DATA` binding.
3. Deploy the Worker:
	```bash
	wrangler deploy
	```
4. Once the deployment succeeds, open the Worker URL (e.g. `https://nexas-worker.your-account.workers.dev/`) to confirm the dashboard renders and data updates.
5. Update each ESP32's `SERVER_URL` to the Worker endpoint plus `/update`, for example `https://nexas-worker.your-account.workers.dev/update`.

> **SSE cadence:** Workers stream the `/events` endpoint by pulling the latest KV snapshot every 5 seconds. Updates may take up to one poll cycle to appear downstream.

## ESP32 configuration

Edit `ESP32/ESPNEXAS.cpp` before flashing:

```cpp
#define DEVICE_ID "ESP32-A"        // B/C for other boards
#define WIFI_SSID "YourNetwork"
#define WIFI_PASSWORD "YourPassword"
#define SERVER_URL "https://<your-service>.onrender.com/update" // or https://<your-worker>.workers.dev/update
```

The sketch scans every ~1 second, calculates distance, and posts JSON `{ "id": "ESP32-A", "distance": 1.23 }`. When the beacon is not seen, `distance` becomes `-1` so the UI shows `-` for that location.