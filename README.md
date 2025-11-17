# Nexas Proximity Monitor

BLE-based room proximity display powered by ESP32 scanners and a Node/Express server.

## Local development

```bash
npm install
PORT=3000 node server.js
```

Open `http://localhost:3000/` to see the live status table. ESP32 devices should post to `http://<your-ip>:3000/update`.

## Deploying to Vercel

1. **Create Vercel KV:** in the Vercel dashboard enable KV for the project. This populates `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and optionally `KV_REST_API_READ_ONLY_TOKEN`.
2. **Set environment variables** for the project:
	- `KV_REST_API_URL`
	- `KV_REST_API_TOKEN`
	- `KV_REST_API_READ_ONLY_TOKEN` (optional but recommended)
	- `KV_KEY` (optional namespace, defaults to `esp32-distance`).
3. **Deploy:**
	```bash
	vercel --prod
	```
4. After deployment, update each ESP32's `SERVER_URL` to the HTTPS endpoint shown by Vercel (e.g. `https://nexasserver.vercel.app/update`).

> **Note:** Vercel's serverless functions are stateless. The built-in KV store keeps distance readings persistent across invocations and multiple regions. Without KV the dashboard will fall back to in-memory storage, which only works for local development.

## ESP32 configuration

Edit `ESP32/ESPNEXAS.cpp` before flashing:

```cpp
#define DEVICE_ID "ESP32-A"        // B/C for other boards
#define WIFI_SSID "YourNetwork"
#define WIFI_PASSWORD "YourPassword"
#define SERVER_URL "https://nexasserver.vercel.app/update"
```

The sketch scans every ~1 second, calculates distance, and posts JSON `{ "id": "ESP32-A", "distance": 1.23 }`. When the beacon is not seen, `distance` becomes `-1` so the UI shows `-` for that location.