package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type TelegramUpdate struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		MessageID int `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
			Username  string `json:"username"`
		} `json:"from"`
		Chat *struct {
			ID    int64  `json:"id"`
			Type  string `json:"type"`
			Title string `json:"title"`
		} `json:"chat"`
		Text            string `json:"text"`
		Date            int64  `json:"date"`
		MessageThreadID *int   `json:"message_thread_id,omitempty"`
	} `json:"message"`
}

func (s *Server) parseTelegramEvent(ctx context.Context, body string) error {
	var update TelegramUpdate
	if err := json.Unmarshal([]byte(body), &update); err != nil {
		return fmt.Errorf("unmarshal telegram update: %w", err)
	}

	if update.Message == nil {
		return nil // skip non-message updates
	}

	msg := update.Message
	if msg.From == nil || msg.Chat == nil {
		return fmt.Errorf("missing from/chat in telegram message")
	}

	// For MVP: use first workspace as default
	workspaceID, err := s.getDefaultWorkspaceID(ctx)
	if err != nil {
		return fmt.Errorf("get default workspace: %w", err)
	}

	// Get or create channel
	channelID, err := s.getOrCreateChannel(ctx, workspaceID, "telegram", fmt.Sprintf("TG-%d", msg.Chat.ID))
	if err != nil {
		return fmt.Errorf("get/create channel: %w", err)
	}

	// Get or create contact
	contactID, err := s.getOrCreateContact(ctx, workspaceID, msg.From.ID, msg.From.FirstName, msg.From.Username)
	if err != nil {
		return fmt.Errorf("get/create contact: %w", err)
	}

	// Get or create thread
	threadRef := fmt.Sprintf("%d", msg.Chat.ID)
	if msg.MessageThreadID != nil {
		threadRef = fmt.Sprintf("%d:%d", msg.Chat.ID, *msg.MessageThreadID)
	}
	threadID, err := s.getOrCreateThread(ctx, workspaceID, channelID, contactID, threadRef)
	if err != nil {
		return fmt.Errorf("get/create thread: %w", err)
	}

	// Create message
	externalTS := time.Unix(msg.Date, 0)
	_, err = s.db.Exec(ctx, `
        INSERT INTO messages (thread_id, direction, type, content, external_message_id, external_ts, created_at)
        VALUES ($1, 'inbound', 'text', $2, $3, $4, $5)
    `, threadID, msg.Text, fmt.Sprintf("tg_%d", msg.MessageID), externalTS, time.Now())
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	// Update thread timestamp
	_, err = s.db.Exec(ctx, `
        UPDATE threads SET updated_at = $1 WHERE id = $2
    `, time.Now(), threadID)
	if err != nil {
		return fmt.Errorf("update thread: %w", err)
	}

	return nil
}

func (s *Server) getDefaultWorkspaceID(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id FROM workspaces LIMIT 1`).Scan(&id)
	return id, err
}

func (s *Server) getOrCreateChannel(ctx context.Context, workspaceID, channelType, displayName string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
        SELECT id FROM channels WHERE workspace_id = $1 AND type = $2 LIMIT 1
    `, workspaceID, channelType).Scan(&id)
	if err == nil {
		return id, nil
	}

	err = s.db.QueryRow(ctx, `
        INSERT INTO channels (workspace_id, type, display_name) 
        VALUES ($1, $2, $3) RETURNING id
    `, workspaceID, channelType, displayName).Scan(&id)
	return id, err
}

func (s *Server) getOrCreateContact(ctx context.Context, workspaceID string, tgUserID int64, firstName, username string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
        SELECT id FROM contacts WHERE workspace_id = $1 AND tg_user_id = $2 LIMIT 1
    `, workspaceID, fmt.Sprintf("%d", tgUserID)).Scan(&id)
	if err == nil {
		return id, nil
	}

	displayName := firstName
	if username != "" {
		displayName = fmt.Sprintf("%s (@%s)", firstName, username)
	}

	err = s.db.QueryRow(ctx, `
        INSERT INTO contacts (workspace_id, display_name, tg_user_id) 
        VALUES ($1, $2, $3) RETURNING id
    `, workspaceID, displayName, fmt.Sprintf("%d", tgUserID)).Scan(&id)
	return id, err
}

func (s *Server) getOrCreateThread(ctx context.Context, workspaceID, channelID, contactID, threadRef string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
        SELECT id FROM threads WHERE workspace_id = $1 AND channel_thread_ref = $2 LIMIT 1
    `, workspaceID, threadRef).Scan(&id)
	if err == nil {
		return id, nil
	}

	err = s.db.QueryRow(ctx, `
        INSERT INTO threads (workspace_id, channel_id, contact_id, channel_thread_ref, status) 
        VALUES ($1, $2, $3, $4, 'open') RETURNING id
    `, workspaceID, channelID, contactID, threadRef).Scan(&id)
	return id, err
}
