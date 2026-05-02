# zylem-assets uploader

A small Go HTTP server that accepts authenticated multipart uploads and stores
them in a Cloudflare R2 bucket fronted by a public CDN domain
(`https://assets.zylem.cloud`). Designed to deploy to Render as a Docker service.

```
client --POST /assets (multipart + Bearer)--> server --PutObject--> R2 bucket --> CDN
```

---

## API

### `POST /assets`

Headers:

- `Authorization: Bearer <API_KEY>`
- `Content-Type: multipart/form-data`

Form fields:

| field     | required | description                                                    |
| --------- | -------- | -------------------------------------------------------------- |
| `file`    | yes      | The asset binary. Filename must include an allowed extension.  |
| `project` | yes      | Slug matching `^[a-z0-9][a-z0-9-]{0,63}$` (e.g. `arena-demo`). |
| `type`    | yes      | One of `model`, `image`, `audio`, `data`.                      |

Allowed extensions per type:

- `model`: `glb`, `gltf`, `fbx`
- `image`: `png`, `jpg`, `jpeg`, `webp`, `gif`
- `audio`: `mp3`, `wav`, `ogg`
- `data`: `json`

Response `200 OK`:

```json
{
	"url": "https://assets.zylem.cloud/demos/arena-demo/models/tank.9fd21a3b.glb",
	"key": "demos/arena-demo/models/tank.9fd21a3b.glb",
	"contentType": "model/gltf-binary",
	"size": 123456,
	"hash": "9fd21a3b8c2e..."
}
```

Errors:

| status | meaning                                      |
| ------ | -------------------------------------------- |
| 400    | invalid `project`, `type`, or missing `file` |
| 401    | bad / missing `Authorization: Bearer` header |
| 413    | upload exceeds `MAX_UPLOAD_MB` bytes         |
| 415    | extension not allowed for the given `type`   |
| 500    | R2 upload failed or temp-file IO failed      |

The R2 object is stored with `Cache-Control: public, max-age=31536000, immutable`.
Because the key includes a content hash, every distinct file gets its own
forever-cacheable URL.

### `GET /healthz`

Returns `200 {"status":"ok"}`. Used by Render's health check.

---

## Local development

Prerequisites: Go 1.23+, an R2 bucket, an R2 API token.

```bash
cd server
cp .env.example .env       # then fill in real values
go mod tidy                # download dependencies + populate go.sum
set -a && source .env && set +a
go run ./cmd/server
```

Quick smoke test in another shell:

```bash
curl -i http://localhost:8080/healthz

curl -i -X POST http://localhost:8080/assets \
  -H "Authorization: Bearer $API_KEY" \
  -F "project=arena-demo" \
  -F "type=image" \
  -F "file=@./tank.png"
```

---

## Cloudflare R2 setup checklist

1. **Create the bucket.** R2 dashboard -> Create bucket -> name it `zylem-assets`.
2. **Attach the custom domain.** Bucket -> Settings -> Custom Domains -> add
   `assets.zylem.dev`. Cloudflare provisions the cert automatically.
3. **Create an API token.** R2 -> Manage R2 API Tokens -> Create API token.
    - Permissions: `Object Read & Write`.
    - Scope: the `zylem-assets` bucket.
    - Save the **Access Key ID** and **Secret Access Key** that Cloudflare shows
      once. Note the **Account ID** displayed near the top of the R2 dashboard.
4. **Generate an upload API key** for this service:
    ```bash
    openssl rand -hex 32
    ```
5. Drop those values into `.env` (or into Render's secret env vars).

---

## Deploy to Render

`render.yaml` lives at `server/render.yaml`. Render reads blueprints from the
repo root by default, so either copy/symlink that file to the repo root, or
in Render's UI choose **New +** -> **Blueprint** -> point it at
`server/render.yaml`. Build paths inside the file are relative to the repo
root regardless.

In the Render dashboard, fill in the env vars marked `sync: false`:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `API_KEY`

Render will pass `PORT` automatically. Health checks hit `/healthz`.

---

## Project layout

```
server/
  cmd/server/main.go           entrypoint: config -> R2 client -> mux -> serve
  internal/config/config.go    env var loading + validation
  internal/auth/apikey.go      Bearer token middleware (constant-time compare)
  internal/r2/client.go        AWS SDK v2 S3 client wired to R2
  internal/keygen/keygen.go    sha256 ingest + key generation + validation rules
  internal/handlers/upload.go  POST /assets
  internal/handlers/health.go  GET /healthz
  Dockerfile                   multi-stage build -> distroless static
  render.yaml                  Render Blueprint
  .env.example                 documented env vars
```

---

## Future work

- `POST /assets/presign` for direct-to-R2 uploads of very large files.
- Per-project API keys (multi-key map in `internal/auth`).
- Optional manifest auto-write to a separate repo or a manifest endpoint.
