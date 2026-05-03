import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Local-only dev tool: the Go uploader runs on :8080, Vite serves on :5173,
// so we proxy /assets and /healthz to the Go server. The browser sees a
// same-origin request, no CORS preflight required.
export default defineConfig({
	plugins: [solid(), tailwindcss()],
	server: {
		port: 5173,
		proxy: {
			"/assets": {
				target: "http://localhost:8080",
				changeOrigin: false,
				// Large multipart bodies can take a while; don't let the proxy
				// kill the request mid-upload.
				timeout: 0,
			},
			"/healthz": "http://localhost:8080",
		},
	},
});
