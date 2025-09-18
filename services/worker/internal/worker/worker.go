package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	asynqServer *asynq.Server
	db          *pgxpool.Pool
}

const TaskWebhookIncoming = "webhook:incoming"

func New(redisAddr string, dbURL string) *Server {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: redisAddr},
		asynq.Config{
			Concurrency: 10,
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				// Exponential backoff baseline
				base := time.Second * 2
				d := base << uint(n)
				if d > 5*time.Minute {
					d = 5 * time.Minute
				}
				return d
			},
		},
	)
	var pool *pgxpool.Pool
	if dbURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		p, err := pgxpool.New(ctx, dbURL)
		if err == nil {
			pool = p
		}
	}
	return &Server{asynqServer: srv, db: pool}
}

func (s *Server) Run(ctx context.Context) error {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TaskWebhookIncoming, s.handleWebhookIncoming)
	return s.asynqServer.Run(mux)
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.asynqServer.Shutdown()
	if s.db != nil {
		s.db.Close()
	}
	return nil
}

func (s *Server) handleWebhookIncoming(ctx context.Context, t *asynq.Task) error {
	var payload map[string]any
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return err
	}

	provider, _ := payload["provider"].(string)
	body, _ := payload["body"].(string)
	sigValid, _ := payload["signature_valid"].(bool)

	fmt.Printf("Processing webhook: provider=%s, body_len=%d, sig_valid=%t\n", provider, len(body), sigValid)

	// Persist raw event if DB is available
	if s.db != nil {
		_, err := s.db.Exec(ctx,
			`INSERT INTO raw_events (provider, body, signature_valid) VALUES ($1, $2::jsonb, $3)`,
			provider, body, sigValid,
		)
		if err != nil {
			fmt.Printf("Failed to insert raw event: %v\n", err)
			return err
		}
		fmt.Printf("Raw event saved successfully\n")
	}

	// Parse and create threads/messages based on provider
	switch provider {
	case "tg":
		if err := s.parseTelegramEvent(ctx, body); err != nil {
			fmt.Printf("Failed to parse telegram event: %v\n", err)
			return fmt.Errorf("parse telegram event: %w", err)
		}
		fmt.Printf("Telegram event parsed successfully\n")
	case "wa":
		// TODO: WhatsApp parsing
		return nil
	default:
		return fmt.Errorf("unknown provider: %s", provider)
	}

	return nil
}
