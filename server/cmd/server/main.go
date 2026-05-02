package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zylem-game-lib/assets/server/internal/auth"
	"github.com/zylem-game-lib/assets/server/internal/config"
	"github.com/zylem-game-lib/assets/server/internal/handlers"
	"github.com/zylem-game-lib/assets/server/internal/r2"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	s3client, err := r2.NewClient(ctx, cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretAccessKey)
	if err != nil {
		log.Fatalf("r2 client: %v", err)
	}

	upload := &handlers.UploadHandler{
		S3:            s3client,
		Bucket:        cfg.R2Bucket,
		PublicBaseURL: cfg.PublicBaseURL,
		MaxBytes:      cfg.MaxUploadBytes,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handlers.Health)
	mux.Handle("POST /assets", auth.RequireBearer(cfg.APIKey)(upload))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 15 * time.Second,
		// No ReadTimeout / WriteTimeout: large uploads can legitimately take minutes.
		// IdleTimeout still bounds keep-alive sockets.
		IdleTimeout: 120 * time.Second,
	}

	go func() {
		log.Printf("zylem-assets uploader listening on %s (bucket=%s, public=%s, max=%d bytes)",
			srv.Addr, cfg.R2Bucket, cfg.PublicBaseURL, cfg.MaxUploadBytes)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutdown: draining active requests")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
}
