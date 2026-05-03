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

// Category is the high-level bucket a file is sorted into. The folder segment
// in the R2 key is derived from this; see (Category).Folder().
type Category string

const (
	CategoryImage    Category = "image"
	CategoryModel    Category = "model"
	CategoryAudio    Category = "audio"
	CategoryVideo    Category = "video"
	CategoryFont     Category = "font"
	CategoryDocument Category = "document"
	CategoryCode     Category = "code"
	CategoryArchive  Category = "archive"
	CategoryOther    Category = "other"
)

var (
	projectRE  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	sanitizeRE = regexp.MustCompile(`[^a-z0-9_-]+`)
	dashRunRE  = regexp.MustCompile(`-+`)
)

// extToCategory is the full extension allowlist. Absence from this map means
// "rejected"; do not add executable or otherwise dangerous formats here.
// IMPORTANT: keep this table in sync with web/src/scanner.ts.
var extToCategory = map[string]Category{
	// images
	"png": CategoryImage, "jpg": CategoryImage, "jpeg": CategoryImage,
	"webp": CategoryImage, "gif": CategoryImage, "svg": CategoryImage,
	"bmp": CategoryImage, "tiff": CategoryImage, "tif": CategoryImage,
	"ico": CategoryImage, "avif": CategoryImage,

	// models
	"glb": CategoryModel, "gltf": CategoryModel, "fbx": CategoryModel,
	"obj": CategoryModel, "stl": CategoryModel, "dae": CategoryModel,
	"3ds": CategoryModel, "blend": CategoryModel, "usdz": CategoryModel,

	// audio
	"mp3": CategoryAudio, "wav": CategoryAudio, "ogg": CategoryAudio,
	"flac": CategoryAudio, "aac": CategoryAudio, "m4a": CategoryAudio,
	"opus": CategoryAudio, "mid": CategoryAudio, "midi": CategoryAudio,

	// video
	"mp4": CategoryVideo, "webm": CategoryVideo, "mov": CategoryVideo,
	"m4v": CategoryVideo, "mkv": CategoryVideo, "avi": CategoryVideo,
	"ogv": CategoryVideo,

	// fonts
	"ttf": CategoryFont, "otf": CategoryFont, "woff": CategoryFont,
	"woff2": CategoryFont, "eot": CategoryFont,

	// documents
	"pdf": CategoryDocument, "txt": CategoryDocument, "md": CategoryDocument,
	"rtf": CategoryDocument, "csv": CategoryDocument, "tsv": CategoryDocument,

	// code / data
	"json": CategoryCode, "yaml": CategoryCode, "yml": CategoryCode,
	"xml": CategoryCode, "html": CategoryCode, "css": CategoryCode,
	"js": CategoryCode, "mjs": CategoryCode, "ts": CategoryCode,
	"jsx": CategoryCode, "tsx": CategoryCode, "toml": CategoryCode,
	"ini": CategoryCode, "sql": CategoryCode,

	// archives
	"zip": CategoryArchive, "tar": CategoryArchive, "gz": CategoryArchive,
	"tgz": CategoryArchive, "7z": CategoryArchive, "rar": CategoryArchive,
	"bz2": CategoryArchive, "xz": CategoryArchive,
}

// blockedExt is consulted before extToCategory and always wins. These are
// rejected even if a future allowlist edit accidentally adds them, as a
// defense-in-depth measure.
// IMPORTANT: keep this set in sync with web/src/scanner.ts.
var blockedExt = map[string]struct{}{
	"exe": {}, "bat": {}, "sh": {}, "ps1": {}, "dll": {},
	"dmg": {}, "app": {}, "msi": {}, "com": {}, "cmd": {},
	"scr": {}, "vbs": {}, "jar": {},
}

// folderByCategory maps each category to the path segment used in the R2 key.
var folderByCategory = map[Category]string{
	CategoryImage:    "images",
	CategoryModel:    "models",
	CategoryAudio:    "audio",
	CategoryVideo:    "video",
	CategoryFont:     "fonts",
	CategoryDocument: "documents",
	CategoryCode:     "code",
	CategoryArchive:  "archives",
	CategoryOther:    "other",
}

// ParseCategory recognizes the canonical category names plus a few legacy
// aliases (e.g. "data" was the pre-redesign type for JSON files; map it to
// "code"). Trims and lowercases input.
func ParseCategory(s string) (Category, bool) {
	v := strings.ToLower(strings.TrimSpace(s))
	switch v {
	case "data":
		return CategoryCode, true
	case "fonts":
		return CategoryFont, true
	case "images":
		return CategoryImage, true
	case "models":
		return CategoryModel, true
	case "videos":
		return CategoryVideo, true
	case "documents", "docs":
		return CategoryDocument, true
	case "archives":
		return CategoryArchive, true
	}
	c := Category(v)
	if _, ok := folderByCategory[c]; ok {
		return c, true
	}
	return "", false
}

// CategoryFromExt looks up the canonical category for ext (without leading dot,
// any case). Returns false if the extension isn't in the allowlist.
func CategoryFromExt(ext string) (Category, bool) {
	c, ok := extToCategory[strings.ToLower(strings.TrimPrefix(ext, "."))]
	return c, ok
}

// IsBlockedExt reports whether ext is on the always-reject list.
func IsBlockedExt(ext string) bool {
	_, ok := blockedExt[strings.ToLower(strings.TrimPrefix(ext, "."))]
	return ok
}

// Folder returns the path segment for the category (e.g. "images").
func (c Category) Folder() string { return folderByCategory[c] }

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
// validated project, c, and the extension of originalFilename.
func BuildKey(project string, c Category, originalFilename, hashFull string) string {
	hash8 := hashFull
	if len(hash8) > 8 {
		hash8 = hash8[:8]
	}
	return fmt.Sprintf(
		"demos/%s/%s/%s.%s.%s",
		project,
		c.Folder(),
		SanitizeBase(originalFilename),
		hash8,
		Ext(originalFilename),
	)
}
