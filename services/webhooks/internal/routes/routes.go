package routes

import (
	"io"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/hibiken/asynq"
)

const TaskWebhookIncoming = "webhook:incoming"

// NewRouter builds the chi router with health and webhook placeholders.
func NewRouter(client *asynq.Client) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	enqueue := func(provider string, body []byte, signatureValid bool) error {
		payload := map[string]interface{}{
			"provider":        provider,
			"body":            string(body),
			"received":        time.Now().UTC().Format(time.RFC3339Nano),
			"signature_valid": signatureValid,
		}
		t := asynq.NewTask(TaskWebhookIncoming, marshalJSON(payload))

		_, err := client.Enqueue(t, asynq.Queue("default"))
		return err
	}

	// WhatsApp Cloud webhook endpoint (signature verification)
	r.Post("/wa/webhook", func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		secret := os.Getenv("WA_APP_SECRET")
		valid := verifyHubSignature(secret, r.Header.Get("X-Hub-Signature-256"), b)
		if !valid {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
		if err := enqueue("wa", b, valid); err != nil {
			http.Error(w, "queue error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("accepted"))
	})

	// Telegram webhook endpoint (secret path)
	r.Post("/tg/{secret}/webhook", func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		expected := os.Getenv("TG_WEBHOOK_SECRET")
		secretParam := chi.URLParam(r, "secret")

		// Debug logging
		w.Header().Set("X-Debug-Expected", expected)
		w.Header().Set("X-Debug-Param", secretParam)

		// For testing, accept any secret if TG_WEBHOOK_SECRET is not set
		if expected != "" && secretParam != expected {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if err := enqueue("tg", b, true); err != nil {
			http.Error(w, "queue error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("accepted"))
	})

	return r
}

func marshalJSON(v any) []byte {
	b, _ := jsonMarshal(v)
	return b
}

// jsonMarshal is defined in json.go to keep imports minimal in this file
