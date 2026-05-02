package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	PublicBaseURL     string
	APIKey            string
	Port              string
	MaxUploadBytes    int64
}

func Load() (*Config, error) {
	cfg := &Config{
		R2AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		R2AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		R2Bucket:          os.Getenv("R2_BUCKET"),
		PublicBaseURL:     strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/"),
		APIKey:            os.Getenv("API_KEY"),
		Port:              os.Getenv("PORT"),
	}

	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	maxMB := 100
	if v := os.Getenv("MAX_UPLOAD_MB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("invalid MAX_UPLOAD_MB: %q", v)
		}
		maxMB = n
	}
	cfg.MaxUploadBytes = int64(maxMB) * 1024 * 1024

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	var missing []string
	if c.R2AccountID == "" {
		missing = append(missing, "R2_ACCOUNT_ID")
	}
	if c.R2AccessKeyID == "" {
		missing = append(missing, "R2_ACCESS_KEY_ID")
	}
	if c.R2SecretAccessKey == "" {
		missing = append(missing, "R2_SECRET_ACCESS_KEY")
	}
	if c.R2Bucket == "" {
		missing = append(missing, "R2_BUCKET")
	}
	if c.PublicBaseURL == "" {
		missing = append(missing, "PUBLIC_BASE_URL")
	}
	if c.APIKey == "" {
		missing = append(missing, "API_KEY")
	}
	if len(missing) > 0 {
		return errors.New("missing required env vars: " + strings.Join(missing, ", "))
	}
	if !strings.HasPrefix(c.PublicBaseURL, "http://") && !strings.HasPrefix(c.PublicBaseURL, "https://") {
		return fmt.Errorf("PUBLIC_BASE_URL must start with http:// or https://, got %q", c.PublicBaseURL)
	}
	return nil
}
