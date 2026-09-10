package claude

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestForkQwenMaxSmallTokenBudgetPreservesNativeModel(t *testing.T) {
	maxTokens := uint(64)
	stream := true
	req := &dto.ClaudeRequest{
		Model:     "qwen3.8-max",
		MaxTokens: &maxTokens,
		Stream:    &stream,
		Messages:  []dto.ClaudeMessage{{Role: "user", Content: "Reply OK"}},
	}
	info := &relaycommon.RelayInfo{
		OriginModelName: req.Model,
		Request:         req,
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: req.Model},
	}
	require.NoError(t, helper.ApplyReasoningModelSuffix(nil, info, req))
	out, err := (&Adaptor{}).ConvertClaudeRequest(nil, info, req)
	require.NoError(t, err)
	converted, ok := out.(*dto.ClaudeRequest)
	require.True(t, ok)
	assert.Equal(t, "qwen3.8-max", converted.Model)
	assert.Equal(t, "qwen3.8-max", info.UpstreamModelName)
	require.NotNil(t, converted.MaxTokens)
	assert.Equal(t, uint(64), *converted.MaxTokens)
	assert.Nil(t, converted.Thinking)
}
