package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func newRouter(db *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS for frontend
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Test endpoint to debug database
	r.Get("/debug/count", func(w http.ResponseWriter, r *http.Request) {
		var count int
		err := db.QueryRow(r.Context(), "SELECT COUNT(*) FROM threads").Scan(&count)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"threads_count": count})
	})

	// Inbox API
	r.Get("/api/threads", func(w http.ResponseWriter, r *http.Request) {
		workspaceID := r.URL.Query().Get("workspace_id")
		if workspaceID == "" {
			http.Error(w, "workspace_id required", http.StatusBadRequest)
			return
		}

		// Test connection first
		if db == nil {
			log.Error().Msg("Database connection is nil")
			http.Error(w, "db connection nil", http.StatusInternalServerError)
			return
		}

		rows, err := db.Query(r.Context(), `
            SELECT 
                t.id::text, 
                t.channel_id::text, 
                t.contact_id::text, 
                t.status, 
                t.updated_at,
                c.display_name,
                ch.type as channel_type
            FROM threads t
            LEFT JOIN contacts c ON t.contact_id = c.id
            LEFT JOIN channels ch ON t.channel_id = ch.id
            WHERE t.workspace_id = $1::uuid
            ORDER BY t.updated_at DESC
            LIMIT 50
        `, workspaceID)
		if err != nil {
			log.Error().Err(err).Str("workspace_id", workspaceID).Msg("threads query failed")
			// Return empty array instead of error for now
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"threads": []interface{}{}})
			return
		}
		defer rows.Close()
		type thread struct {
			ID          string         `json:"id"`
			ChannelID   string         `json:"channel_id"`
			ContactID   sql.NullString `json:"contact_id"`
			Status      string         `json:"status"`
			UpdatedAt   time.Time      `json:"updated_at"`
			ContactName sql.NullString `json:"contact_name"`
			ChannelType sql.NullString `json:"channel_type"`
		}
		var list []thread
		for rows.Next() {
			var t thread
			if err := rows.Scan(&t.ID, &t.ChannelID, &t.ContactID, &t.Status, &t.UpdatedAt, &t.ContactName, &t.ChannelType); err != nil {
				http.Error(w, "scan error", http.StatusInternalServerError)
				return
			}
			list = append(list, t)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"threads": list})
	})

	r.Get("/api/threads/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		threadID := chi.URLParam(r, "id")

		// Test connection first
		if db == nil {
			log.Error().Msg("Database connection is nil")
			http.Error(w, "db connection nil", http.StatusInternalServerError)
			return
		}

		rows, err := db.Query(r.Context(), `
            SELECT id::text, direction, type, content, created_at
            FROM messages
            WHERE thread_id = $1::uuid
            ORDER BY created_at DESC
            LIMIT 200
        `, threadID)
		if err != nil {
			log.Error().Err(err).Str("thread_id", threadID).Msg("messages query failed")
			// Return empty array instead of error for now
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"messages": []interface{}{}})
			return
		}
		defer rows.Close()
		type message struct {
			ID        string    `json:"id"`
			Direction string    `json:"direction"`
			Type      string    `json:"type"`
			Content   *string   `json:"content"`
			CreatedAt time.Time `json:"created_at"`
		}
		var list []message
		for rows.Next() {
			var m message
			if err := rows.Scan(&m.ID, &m.Direction, &m.Type, &m.Content, &m.CreatedAt); err != nil {
				http.Error(w, "scan error", http.StatusInternalServerError)
				return
			}
			list = append(list, m)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"messages": list})
	})

	// SSE endpoint for real-time updates
	r.Options("/api/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")
		w.WriteHeader(http.StatusOK)
	})

	r.Get("/api/events", func(w http.ResponseWriter, r *http.Request) {
		// Set SSE headers
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

		// Create a channel to send events
		eventChan := make(chan string, 10)

		// Store the channel (in production, use a proper connection manager)
		// For now, we'll use a simple approach with polling
		go func() {
			defer close(eventChan)

			// Simple polling every 1 second for faster updates
			ticker := time.NewTicker(1 * time.Second)
			defer ticker.Stop()

			lastMessageCount := 0
			lastThreadCount := 0

			for {
				select {
				case <-ticker.C:
					if db == nil {
						continue
					}

					// Check for new messages
					var messageCount int
					err := db.QueryRow(r.Context(), `SELECT COUNT(*) FROM messages`).Scan(&messageCount)
					if err != nil {
						continue
					}

					// Check for new threads
					var threadCount int
					err = db.QueryRow(r.Context(), `SELECT COUNT(*) FROM threads`).Scan(&threadCount)
					if err != nil {
						continue
					}

					// Send event if there are new messages or threads
					if messageCount > lastMessageCount || threadCount > lastThreadCount {
						eventChan <- fmt.Sprintf(`data: {"type": "update", "messages": %d, "threads": %d}`, messageCount, threadCount)
						lastMessageCount = messageCount
						lastThreadCount = threadCount
					}

				case <-r.Context().Done():
					return
				}
			}
		}()

		// Send events to client
		for event := range eventChan {
			fmt.Fprintf(w, "%s\n\n", event)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	})

	return r
}

func main() {
	zerolog.TimeFieldFormat = time.RFC3339Nano
	if os.Getenv("APP_ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}

	addr := os.Getenv("API_ADDRESS")
	if addr == "" {
		addr = ":8081"
	}
	// DB connect
	dbURL := os.Getenv("DATABASE_URL")
	log.Info().Str("database_url", dbURL).Msg("Connecting to database")
	var db *pgxpool.Pool
	if dbURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var err error
		db, err = pgxpool.New(ctx, dbURL)
		if err == nil {
			// Test actual connection with ping
			if err := db.Ping(ctx); err != nil {
				log.Error().Err(err).Str("database_url", dbURL).Msg("db ping failed")
				db.Close()
				db = nil
			} else {
				log.Info().Msg("Database connection successful")
			}
		} else {
			log.Error().Err(err).Str("database_url", dbURL).Msg("db connect failed")
			db = nil
		}
	} else {
		log.Error().Msg("DATABASE_URL environment variable is not set")
	}
	defer func() {
		if db != nil {
			db.Close()
		}
	}()
	srv := &http.Server{
		Addr:              addr,
		Handler:           newRouter(db),
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info().Str("addr", addr).Msg("api starting")
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
