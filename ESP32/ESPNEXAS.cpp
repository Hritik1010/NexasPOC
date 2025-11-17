// ESP32 BLE distance scanner that reports to an HTTP server
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "BLEDevice.h"

// =====================
// Configuration
// =====================
// Target UUID (advertised by your app/device)
static const char* TARGET_UUID = "AA01";

// Identify this ESP32 on the server as ESP32-A / ESP32-B / ESP32-C
#ifndef DEVICE_ID
#define DEVICE_ID "ESP32-A"
#endif

// WiFi credentials (set these before flashing)
#ifndef WIFI_SSID
#define WIFI_SSID "Zoo_Studio_2.4"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "Trh@1234"
#endif

// Server URL (Node server's /update endpoint). Example: http://192.168.1.100/update
#ifndef SERVER_URL
#define SERVER_URL "http://192.168.3.91:3000/update"
#endif

// Distance estimation constants
#define ENV_FACTOR 2.0      // Signal propagation constant (environment factor)
#define RSSI_AT_1M -59      // Reference RSSI at 1 meter

// Optional smoothing for RSSI readings (0 < ALPHA <= 1). Higher = faster response
#define SMOOTHING_ALPHA 0.6

// =====================
// Helpers
// =====================
static float rssiEMA = NAN;  // Exponential moving average of RSSI

static double rssiToDistance(int rssi) {
  // Optionally smooth RSSI to reduce jitter
  if (isnan(rssiEMA)) {
    rssiEMA = (float)rssi;
  } else {
    rssiEMA = (float)SMOOTHING_ALPHA * rssi + (1.0f - (float)SMOOTHING_ALPHA) * rssiEMA;
  }
  double distance = pow(10.0, ((RSSI_AT_1M - rssiEMA) / (10.0 * ENV_FACTOR)));
  return distance;
}

static void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("\nConnecting to WiFi SSID '%s'\n", WIFI_SSID);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
    if (millis() - start > 20000) {
      Serial.println("\nWiFi connect timeout, retrying...");
      start = millis();
    }
  }
  Serial.printf("\n✅ WiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
}

static void postDistance(double distance) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Send -1 when not found
  String payload = String("{\"id\":\"") + DEVICE_ID + "\",\"distance\":" + String(distance, 2) + "}";
  int code = http.POST(payload);

  if (code > 0) {
    Serial.printf("POST %s => HTTP %d\n", SERVER_URL, code);
    String resp = http.getString();
    if (resp.length()) Serial.printf("Response: %s\n", resp.c_str());
  } else {
    Serial.printf("POST failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\nBooting ESP32 BLE distance scanner...");

  connectWiFi();

  // Initialize BLE
  BLEDevice::init("");
}

void loop() {
  // Configure and start a scan
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);     // Active scan = more detailed data
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  const int SCAN_SECONDS = 5;
  BLEScanResults foundDevices = pBLEScan->start(SCAN_SECONDS, false);

  int count = foundDevices.getCount();
  bool foundTarget = false;
  int bestRSSI = -127;  // track the strongest signal matching the UUID this cycle

  Serial.printf("\n=== Scanning... Found %d BLE devices ===\n", count);

  for (int i = 0; i < count; i++) {
    BLEAdvertisedDevice device = foundDevices.getDevice(i);

    // Check if device advertises the target UUID
    if (device.haveServiceUUID() && device.isAdvertisingService(BLEUUID(TARGET_UUID))) {
      foundTarget = true;
      int rssi = device.getRSSI();
      if (rssi > bestRSSI) bestRSSI = rssi;  // keep the strongest
    }
  }

  if (foundTarget) {
    double distance = rssiToDistance(bestRSSI);
    Serial.printf("✅ Target found. RSSI=%d dBm (smoothed=%.1f) -> Distance=%.2f m\n", bestRSSI, rssiEMA, distance);
    postDistance(distance);
  } else {
    Serial.println("❌ Target not found in this scan. Reporting -1");
    postDistance(-1.0);
  }

  pBLEScan->clearResults();  // Free memory
  delay(2000);
}
