package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCountClaudeTokensReturnsInputTokensWhenRelayCountingDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalCountToken := constant.CountToken
	constant.CountToken = false
	t.Cleanup(func() {
		constant.CountToken = originalCountToken
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/messages/count_tokens?beta=true",
		strings.NewReader(`{
			"model":"gemini-3.6-flash",
			"messages":[{"role":"user","content":"count this prompt"}],
			"tools":[{"name":"lookup","description":"Look up a value","input_schema":{"type":"object","properties":{"query":{"type":"string"}}}}]
		}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyOriginalModel, "gemini-3.6-flash")

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		InputTokens int `json:"input_tokens"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Positive(t, response.InputTokens)
}

func TestCountClaudeTokensRejectsMissingMessages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/messages/count_tokens",
		strings.NewReader(`{"model":"gemini-3.6-flash"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	CountClaudeTokens(ctx)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	var response struct {
		Type  string `json:"type"`
		Error struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "error", response.Type)
	assert.Equal(t, "invalid_request_error", response.Error.Type)
	assert.Contains(t, response.Error.Message, "messages")
}

func TestReasoningReplayRawEntryRejectsBeforeRelay(t *testing.T) {
	for _, tc := range []struct {
		header, body string
		status       int
	}{
		{body: `{"model":"claude","messages":[{"role":"assistant","content":null,"newapi_reasoning":null}]}`, status: 400},
		{header: "v2", body: `{"model":"claude","messages":[]}`, status: 400},
		{header: "v1", body: `{"model":"claude","messages":[{"role":"assistant","content":null,"newapi_reasoning":{"version":1,"version":1,"source":"anthropic_messages","content":[]}}]}`, status: 400},
		{header: "v1", body: `{"model":"claude","messages":[{"role":"assistant","content":null,"newapi_reasoning":{"version":1,"source":"anthropic_messages","content":[{"type":"thinking","thinking":"secret-body","signature":"secret-signature","unknown":true}]}}]}`, status: 400},
	} {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(tc.body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		ctx.Request.Header.Set("X-New-Api-Reasoning-Transport", tc.header)
		// No database, billing session or channel fixture exists: malformed transport
		// must return before the ordinary relay lifecycle touches any of them.
		Relay(ctx, types.RelayFormatOpenAI)
		assert.Equal(t, tc.status, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "invalid_reasoning_replay")
		assert.NotContains(t, recorder.Body.String(), "secret-body")
		assert.NotContains(t, recorder.Body.String(), "secret-signature")
	}
}
