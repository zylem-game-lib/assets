# zylem assets

Demo and example assets for Zylem. Lightweight, ready-to-use examples for testing and showcasing Zylem’s features.

---

## ✨ Features

- Curated collection of images, textures, and models primarily sourced from OpenArt
- Organized and optimized for demos, prototypes, and example scenes in Zylem
- Useful for testing rendering, physics, and gameplay systems

---

### 📦 Install

```bash
npm install @zylem/assets
```

### 🔧 Usage

Import any asset path (bundlers like Vite/Webpack will resolve them):

```ts
/// <reference types="@zylem/assets" />

import playerShip from '@zylem/assets/2d/space/player-ship.png';
import grassTexture from '@zylem/assets/3d/textures/grass.jpg';
import mascotRun from '@zylem/assets/3d/mascot/run.fbx';
import coinSfx from '@zylem/assets/sfx/coin-sound.mp3';
```

---

### 📚 Purpose

- These assets are not intended for production use. Instead, they provide consistent examples for Zylem’s tutorials and documentation
- A quick way to test engine features without needing custom art
- Reference material for developers exploring Zylem

---

### 📜 Credits

- Most assets come from OpenArt. Please refer to their usage policies for licensing details.

---

### ☁️ Upload Server

This repo also contains the source for a small Go HTTP server that uploads
assets to a Cloudflare R2 bucket fronted by `https://assets.zylem.cloud`.
For larger or non-bundled assets, prefer hosting them on the CDN and committing
just JSON manifests with the resulting URLs.

See [server/README.md](server/README.md) for API details, local development,
R2 setup, and Render deployment.

```bash
curl -X POST https://uploader.zylem.dev/assets \
  -H "Authorization: Bearer $ZYLEM_UPLOAD_KEY" \
  -F "project=arena-demo" \
  -F "type=model" \
  -F "file=@./tank.glb"
# -> { "url": "https://assets.zylem.cloud/demos/arena-demo/models/tank.9fd21a3b.glb", ... }
```

---

### 🖥️ Web UI

A SolidJS dev tool for batch-uploading a project directory in one click. Drop a
folder shaped like `project/{models,images,audio,data}/file.ext`, review the
plan, and copy or download the resulting JSON manifest of CDN URLs.

See [web/README.md](web/README.md) for setup. Local-only (`npm run dev`) — it
proxies to the Go server on `localhost:8080`, so no CORS plumbing is needed.

---

### 🧾 License

MIT © 2025 zylem-game-lib
