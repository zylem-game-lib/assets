package keygen

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// AssetType is the high-level category clients send under the form field "type".
type AssetType string

const (
	TypeModel AssetType = "model"
	TypeImage AssetType = "image"
	TypeAudio AssetType = "audio"
	TypeData  AssetType = "data"
)

var (
	projectRE  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	sanitizeRE = regexp.MustCompile(`[^a-z0-9_-]+`)
	dashRunRE  = regexp.MustCompile(`-+`)
)

// extensionAllowlist maps each asset type to its accepted lowercase extensions.
var extensionAllowlist = map[AssetType]map[string]struct{}{
	TypeModel: {"glb": {}, "gltf": {}, "fbx": {}},
	TypeImage: {"png": {}, "jpg": {}, "jpeg": {}, "webp": {}, "gif": {}},
	TypeAudio: {"mp3": {}, "wav": {}, "ogg": {}},
	TypeData:  {"json": {}},
}

// folderByType maps each asset type to the path segment used in the R2 key.
var folderByType = map[AssetType]string{
	TypeModel: "models",
	TypeImage: "images",
	TypeAudio: "audio",
	TypeData:  "data",
}

// ParseType validates and returns a known AssetType.
func ParseType(s string) (AssetType, bool) {
	t := AssetType(strings.ToLower(strings.TrimSpace(s)))
	if _, ok := folderByType[t]; ok {
		return t, true
	}
	return "", false
}

// Folder returns the path segment for the asset type (e.g. "models").
func (t AssetType) Folder() string { return folderByType[t] }

// AllowsExt reports whether ext (without leading dot, any case) is allowed for this type.
func (t AssetType) AllowsExt(ext string) bool {
	allowed, ok := extensionAllowlist[t]
	if !ok {
		return false
	}
	_, ok = allowed[strings.ToLower(strings.TrimPrefix(ext, "."))]
	return ok
}

// ValidProject reports whether the project slug matches the allowed shape.
func ValidProject(project string) bool { return projectRE.MatchString(project) }

// Ext returns the lowercase extension of filename without the leading dot.
func Ext(filename string) string {
	return strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
}

// SanitizeBase strips the extension from filename and produces a slug suitable
// for inclusion in an R2 key path. Falls back to "asset" if nothing survives.
func SanitizeBase(filename string) string {
	base := filepath.Base(filename)
	if ext := filepath.Ext(base); ext != "" {
		base = strings.TrimSuffix(base, ext)
	}
	base = strings.ToLower(base)
	base = sanitizeRE.ReplaceAllString(base, "-")
	base = dashRunRE.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-_")
	if base == "" {
		return "asset"
	}
	return base
}

// Ingest copies r to a freshly-created temp file while computing its sha256.
// The returned file is rewound to offset 0 so it can be read again (e.g. for
// upload). Callers MUST Close + Remove the file when done.
func Ingest(r io.Reader) (*os.File, int64, string, error) {
	f, err := os.CreateTemp("", "zylem-upload-*.bin")
	if err != nil {
		return nil, 0, "", fmt.Errorf("create temp file: %w", err)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), r)
	if err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return nil, 0, "", fmt.Errorf("copy upload: %w", err)
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return nil, 0, "", fmt.Errorf("rewind temp file: %w", err)
	}
	return f, n, hex.EncodeToString(h.Sum(nil)), nil
}

// BuildKey assembles "demos/{project}/{folder}/{base}.{hash8}.{ext}" using the
// first 8 hex characters of hashFull. The caller is expected to have already
// validated project, t, and the extension of originalFilename.
func BuildKey(project string, t AssetType, originalFilename, hashFull string) string {
	hash8 := hashFull
	if len(hash8) > 8 {
		hash8 = hash8[:8]
	}
	return fmt.Sprintf(
		"demos/%s/%s/%s.%s.%s",
		project,
		t.Folder(),
		SanitizeBase(originalFilename),
		hash8,
		Ext(originalFilename),
	)
}
