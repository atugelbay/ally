package routes

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// verifyHubSignature validates X-Hub-Signature-256 header against body using secret.
// Header format examples: "sha256=<hex>" or just "<hex>".
func verifyHubSignature(secret string, header string, body []byte) bool {
	if secret == "" || header == "" {
		return false
	}
	sig := header
	if strings.HasPrefix(strings.ToLower(sig), "sha256=") {
		sig = sig[7:]
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := mac.Sum(nil)
	given, err := hex.DecodeString(sig)
	if err != nil {
		return false
	}
	return hmac.Equal(expected, given)
}
