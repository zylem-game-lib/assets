# zylem assets

Demo and example assets for Zylem. Lightweight, ready-to-use examples for testing and showcasing Zylem’s features.

---

### ✨ Features

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

import playerShip from "@zylem/assets/2d/space/player-ship.png";
import grassTexture from "@zylem/assets/3d/textures/grass.jpg";
import mascotRun from "@zylem/assets/3d/mascot/run.fbx";
import coinSfx from "@zylem/assets/sfx/coin-sound.mp3";
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

### 🧾 License

MIT © 2025 zylem-game-lib
