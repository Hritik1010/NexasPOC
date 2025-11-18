const app = require("./server");

const PORT = process.env.PORT || 80;

app.listen(PORT, "0.0.0.0", () => {
	console.log(`✅ Server running on port ${PORT}`);
	console.log(`Open http://localhost:${PORT}/ or http://<LAN-IP>:${PORT}/ in your browser`);
});
