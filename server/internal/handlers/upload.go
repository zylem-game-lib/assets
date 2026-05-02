package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/zylem-game-lib/assets/server/internal/keygen"
)

// S3API is the subset of the s3.Client surface we depend on. Keeping it small
// makes the handler trivial to test against a fake.
type S3API interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

type UploadHandler struct {
	S3            S3API
	Bucket        string
	PublicBaseURL string
	MaxBytes      int64
}

type uploadResponse struct {
	URL         string `json:"url"`
	Key         string `json:"key"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	Hash        string `json:"hash"`
}

// Curated extension → content type table. We prefer this over mime.TypeByExtension
// for binary formats whose registered MIME types are unreliable (.glb, .fbx).
var contentTypeByExt = map[string]string{
	"glb":  "model/gltf-binary",
	"gltf": "model/gltf+json",
	"fbx":  "application/octet-stream",
	"png":  "image/png",
	"jpg":  "image/jpeg",
	"jpeg": "image/jpeg",
	"webp": "image/webp",
	"gif":  "image/gif",
	"mp3":  "audio/mpeg",
	"wav":  "audio/wav",
	"ogg":  "audio/ogg",
	"json": "application/json",
}

func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, h.MaxBytes)

	// 32 MiB in-memory buffer; anything larger spills to the OS temp dir.
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("upload exceeds %d bytes", h.MaxBytes))
			return
		}
		writeError(w, http.StatusBadRequest, "invalid multipart form: "+err.Error())
		return
	}

	project := strings.TrimSpace(r.FormValue("project"))
	if !keygen.ValidProject(project) {
		writeError(w, http.StatusBadRequest, "field 'project' must match ^[a-z0-9][a-z0-9-]{0,63}$")
		return
	}

	assetType, ok := keygen.ParseType(r.FormValue("type"))
	if !ok {
		writeError(w, http.StatusBadRequest, "field 'type' must be one of: model, image, audio, data")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "field 'file' is required")
		return
	}
	defer file.Close()

	ext := keygen.Ext(header.Filename)
	if ext == "" {
		writeError(w, http.StatusBadRequest, "filename must include an extension")
		return
	}
	if !assetType.AllowsExt(ext) {
		writeError(w, http.StatusUnsupportedMediaType, fmt.Sprintf("extension .%s is not allowed for type %q", ext, assetType))
		return
	}

	tmp, size, fullHash, err := keygen.Ingest(file)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("upload exceeds %d bytes", h.MaxBytes))
			return
		}
		log.Printf("upload: ingest failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to read upload")
		return
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
	}()

	key := keygen.BuildKey(project, assetType, header.Filename, fullHash)
	contentType := resolveContentType(ext)

	_, err = h.S3.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:        aws.String(h.Bucket),
		Key:           aws.String(key),
		Body:          tmp,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
		CacheControl:  aws.String("public, max-age=31536000, immutable"),
	})
	if err != nil {
		log.Printf("upload: r2 PutObject failed for key=%s: %v", key, err)
		writeError(w, http.StatusInternalServerError, "failed to store object")
		return
	}

	resp := uploadResponse{
		URL:         h.PublicBaseURL + "/" + key,
		Key:         key,
		ContentType: contentType,
		Size:        size,
		Hash:        fullHash,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func resolveContentType(ext string) string {
	if v, ok := contentTypeByExt[strings.ToLower(ext)]; ok {
		return v
	}
	if v := mime.TypeByExtension("." + ext); v != "" {
		return v
	}
	return "application/octet-stream"
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
