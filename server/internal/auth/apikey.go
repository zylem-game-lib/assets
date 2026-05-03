package auth

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// RequireBearer returns middleware that enforces "Authorization: Bearer <expected>".
// The comparison is constant-time to avoid leaking the key via timing attacks.
func RequireBearer(expected string) func(http.Handler) http.Handler {
	expectedBytes := []byte(expected)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(h, prefix) {
				unauthorized(w)
				return
			}
			provided := []byte(strings.TrimSpace(strings.TrimPrefix(h, prefix)))
			if subtle.ConstantTimeEq(int32(len(provided)), int32(len(expectedBytes))) != 1 ||
				subtle.ConstantTimeCompare(provided, expectedBytes) != 1 {
				unauthorized(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="zylem-demo-assets"`)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
