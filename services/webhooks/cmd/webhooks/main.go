package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"ally/services/webhooks/internal/routes"
)

type serverConfig struct {
	Address string
	Env     string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getServerConfig() serverConfig {
	return serverConfig{
		Address: getenv("WEBHOOKS_ADDRESS", ":9090"),
		Env:     getenv("APP_ENV", "development"),
	}
}

// router is provided by internal/routes

func main() {
	zerolog.TimeFieldFormat = time.RFC3339Nano
	if os.Getenv("APP_ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}

	cfg := getServerConfig()
	// asynq client for enqueuing webhook events
	redisAddr := getenv("REDIS_ADDR", "127.0.0.1:6379")
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: redisAddr})
	defer client.Close()

	srv := &http.Server{
		Addr:              cfg.Address,
		Handler:           routes.NewRouter(client),
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info().Str("addr", cfg.Address).Msg("webhooks service starting")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
		_ = srv.Close()
	}
	log.Info().Msg("server stopped")
}
