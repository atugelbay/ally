package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"ally/services/worker/internal/worker"
)

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	zerolog.TimeFieldFormat = time.RFC3339Nano
	if os.Getenv("APP_ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}

	redisURL := getenv("REDIS_URL", "redis://127.0.0.1:6379")
	dbURL := getenv("DATABASE_URL", "")

	// Extract address from Redis URL for asynq
	redisAddr := "127.0.0.1:6379"
	if redisURL != "" {
		// Simple parsing: remove redis:// prefix
		if len(redisURL) > 7 && redisURL[:7] == "redis://" {
			redisAddr = redisURL[7:]
		}
	}

	srv := worker.New(redisAddr, dbURL)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info().Str("redis", redisAddr).Msg("worker starting")
		if err := srv.Run(context.Background()); err != nil {
			log.Fatal().Err(err).Msg("worker stopped with error")
		}
	}()

	<-ctx.Done()
	_ = srv.Shutdown(context.Background())
	log.Info().Msg("worker stopped")
}
