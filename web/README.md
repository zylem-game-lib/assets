# zylem-assets uploader (web UI)

A SolidJS single-page app that batch-uploads a directory of assets to the
Go server in [server/](../server). Local-only dev tool.

```
choose folder    classify     POST /assets    R2 PutObject
   arena/    ->  pending  ->  via Vite     ->  via Go    ->  CDN URL
   models/       skipped      proxy            server
   images/      ...
```

---

## Conventions

The picked directory is treated as a single project. Layout:

```
arena/                       <- project = "arena"
  models/tank.glb            <- type = "model"
  models/vehicles/jeep.glb   <- still type = "model" (any depth allowed)
  images/character-select.png<- type = "image"
  audio/hit.mp3              <- type = "audio"
  data/levels.json           <- type = "data"
  README.md                  <- skipped (not in a recognized type folder)
```

Recognized type folders: `models`, `images`, `audio`, `data`. Anything else is
skipped with a reason and not sent. Extension allowlists mirror the Go server
so the UI never makes a request the server would reject.

---

## Prerequisites

- Node 20+
- The Go uploader running on `http://localhost:8080`
  (see [../server/README.md](../server/README.md) for setup).
- Your server's `API_KEY` value handy — you'll paste it into the UI.

---

## Run it

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`.

1. Paste the `API_KEY` from `server/.env` into the **API key** field. It's
   stored in localStorage so you only do this once per browser.
2. Leave **API base URL** empty. The Vite dev server proxies `/assets` and
   `/healthz` to `localhost:8080`, so the browser sees same-origin requests
   and there's no CORS preflight.
3. Drag a project folder into the drop zone (or click "Choose folder").
4. Review the table. Skipped rows tell you why (wrong type folder, disallowed
   extension, etc.).
5. Click **Upload N** to run the batch (4 concurrent requests).
6. When everything is settled, the manifest panel shows the JSON you can copy
   or download.

---

## Manifest format

Keys are paths relative to the project root, so the same source folder always
produces the same keys (and re-running just refreshes the URLs):

```json
{
  "project": "arena",
  "uploadedAt": "2026-05-02T17:32:00.000Z",
  "assets": {
    "models/tank.glb": {
      "type": "model",
      "url": "https://assets.zylem.dev/demos/arena/models/tank.9fd21a3b.glb",
      "key": "demos/arena/models/tank.9fd21a3b.glb",
      "contentType": "model/gltf-binary",
      "size": 12345,
      "hash": "9fd21a3b..."
    }
  }
}
```

---

## Troubleshooting

- **"Upload N" button is greyed out.** Either the API key field is empty or the
  project slug isn't valid (`^[a-z0-9][a-z0-9-]{0,63}$`). The slug input
  highlights red when it's invalid.
- **All rows fail with `[401] unauthorized`.** Wrong API key, or the Go server
  isn't using the same `API_KEY` you pasted. Restart the server after editing
  `server/.env`.
- **All rows fail with `Failed to fetch`.** Go server isn't running on `:8080`,
  or you set **API base URL** to a remote host that lacks CORS headers. Leave
  it empty for local dev.
- **`[500] failed to store object` with no R2 activity.** Usually the wrong
  `R2_ACCOUNT_ID` or `R2_BUCKET` in `server/.env`. The server's stderr will
  show the underlying R2 error (e.g. `NoSuchBucket`).
- **Folder picker is missing in Firefox.** All current Firefox/Chromium/Safari
  releases support `<input webkitdirectory>` and folder drag-drop; if a row's
  path comes out as just the filename, your browser doesn't support directory
  selection — upgrade or use a different browser.

---

## Deploying this UI later

This project is intentionally not deployed. To host it (e.g. Cloudflare Pages):

1. Add CORS handling to the Go server (the upload endpoint, plus an OPTIONS
   handler for preflight).
2. Set **API base URL** in the deployed UI to the public uploader URL.
3. Continue to require pasting the API key — never bake it into the bundle.

---

## Project layout

```
web/
  package.json
  vite.config.ts        solid + tailwind + dev proxy
  tsconfig.json
  index.html
  src/
    main.tsx            mount point
    App.tsx             single-screen UI
    types.ts            shared TS types
    settings.ts         localStorage-persisted apiBaseUrl + apiKey
    scanner.ts          File[] -> project + classified rows
    dragdrop.ts         DataTransferItemList -> PickedFile[] (folder-aware)
    api.ts              fetch wrapper for POST /assets
    queue.ts            small concurrency-limited runner
    manifest.ts         build / copy / download manifest JSON
    index.css           tailwind v4 entry
```
