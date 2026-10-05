package relayconvert

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/replay"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const replayFixture = `[{"type":"thinking","thinking":"a","signature":""},{"type":"text","text":""},{"type":"tool_use","id":"call_1","name":"read","input":{"n":9007199254740993}},{"type":"thinking","thinking":"b","signature":"opaque"},{"type":"redacted_thinking","data":"opaque-redacted"},{"type":"text","text":"你好"}]`

func TestReasoningReplayRoundTrip(t *testing.T) {
	for _, content := range []string{replayFixture, `[]`, `[{"type":"text","text":""}]`, `[{"type":"text","text":"only"}]`} {
		t.Run(content, func(t *testing.T) {
			for range 2 {
				message, err := replay.Project(json.RawMessage(content), convmeta.ReasoningReplayOptions{})
				require.NoError(t, err)
				wire, err := kitutil.Marshal(message)
				require.NoError(t, err)
				var decoded dto.Message
				require.NoError(t, kitutil.Unmarshal(wire, &decoded))
				meta := &convmeta.Values{Options: &convmeta.Options{ReasoningReplay: &convmeta.ReasoningReplayOptions{}}}
				req, err := OpenAIChatRequestToClaudeMessages(context.Background(), meta, dto.GeneralOpenAIRequest{MaxTokens: kitutil.GetPointer(uint(10)), Messages: []dto.Message{decoded}})
				require.NoError(t, err)
				restored, err := kitutil.Marshal(req.Messages[len(req.Messages)-1].Content)
				require.NoError(t, err)
				assert.Equal(t, content, string(restored))
				content = string(restored)
			}
		})
	}
}

func TestReasoningReplayRejectsInvalidInput(t *testing.T) {
	for _, content := range []string{`null`, `[{"type":"text","text":null}]`, `[{"type":"text","text":"a","text":"b"}]`, `[{"type":"text","text":"a","citations":[]}]`, `[{"type":"future"}]`, `[{"type":"tool_use","id":"a","name":"b","input":{"x":1,"x":2}}]`, `[{"type":"tool_use","id":"a","name":"b","input":[]}]`} {
		_, err := replay.Project(json.RawMessage(content), convmeta.ReasoningReplayOptions{})
		require.Error(t, err, content)
	}
	message, err := replay.Project(json.RawMessage(replayFixture), convmeta.ReasoningReplayOptions{})
	require.NoError(t, err)
	message.Content = "edited"
	_, err = replay.Restore(message, convmeta.ReasoningReplayOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "reasoning_replay_mismatch")
	assert.NotContains(t, err.Error(), "opaque")
}

func TestReasoningReplayLimitsAndHistory(t *testing.T) {
	limits := convmeta.ReasoningReplayOptions{}
	base := `[{"type":"text","text":""}]`
	message, err := replay.Project(json.RawMessage(base), limits)
	require.NoError(t, err)
	encoded, err := kitutil.Marshal(message.NewAPIReasoning)
	require.NoError(t, err)
	content := `[{"type":"text","text":"` + strings.Repeat("x", (1<<20)-len(encoded)) + `"}]`
	message, err = replay.Project(json.RawMessage(content), limits)
	require.NoError(t, err)
	encoded, err = kitutil.Marshal(message.NewAPIReasoning)
	require.NoError(t, err)
	assert.Len(t, encoded, 1<<20)
	_, err = replay.Project(json.RawMessage(strings.Replace(content, `"text":"`, `"text":"x`, 1)), limits)
	require.Error(t, err)
	req := dto.GeneralOpenAIRequest{}
	for range 8 {
		req.Messages = append(req.Messages, dto.Message{Role: "user", Content: "next"}, message)
	}
	require.NoError(t, replay.ValidateRequest(&req, limits))
	req.Messages = append(req.Messages, dto.Message{Role: "user", Content: "next"}, message)
	require.Error(t, replay.ValidateRequest(&req, limits))
	for _, n := range []int{256, 257} {
		content := "[" + strings.TrimSuffix(strings.Repeat(`{"type":"text","text":""},`, n), ",") + "]"
		_, err := replay.Project(json.RawMessage(content), limits)
		if n == 256 {
			require.NoError(t, err)
		} else {
			require.Error(t, err)
		}
	}
	for _, limit := range []convmeta.ReasoningReplayOptions{{MaxBlocks: -1}, {MaxMessageBytes: (1 << 20) + 1}, {MaxRequestBytes: (8 << 20) + 1}, {MaxBlocks: 257}, {MaxMessageBytes: 1}} {
		_, err := replay.Project(json.RawMessage(base), limit)
		require.Error(t, err)
	}
	for _, wire := range []string{
		`{"role":"assistant","content":null,"newapi_reasoning":null}`,
		`{"role":"assistant","content":null,"reasoning_content":null}`,
		`{"role":"assistant","content":null,"reasoning_content":""}`,
		`{"role":"user","content":null,"newapi_reasoning":{"version":1,"source":"anthropic_messages","content":[]}}`,
		`{"role":"assistant","content":null,"newapi_reasoning":{"version":2,"source":"anthropic_messages","content":[]}}`,
		`{"role":"assistant","content":null,"newapi_reasoning":{"version":1,"source":"other","content":[]}}`,
		`{"role":"assistant","content":null,"newapi_reasoning":{"version":1,"source":"anthropic_messages","content":[],"extra":0}}`,
		`{"role":"assistant","content":null,"newapi_reasoning":{"version":1,"version":1,"source":"anthropic_messages","content":[]}}`,
	} {
		var m dto.Message
		require.NoError(t, kitutil.Unmarshal([]byte(wire), &m))
		require.Error(t, replay.ValidateRequest(&dto.GeneralOpenAIRequest{Messages: []dto.Message{m}}, limits), wire)
	}
	m, err := replay.Project(json.RawMessage(base), limits)
	require.NoError(t, err)
	require.Error(t, replay.ValidateRequest(&dto.GeneralOpenAIRequest{Messages: []dto.Message{m, m}}, limits))
}

func TestReasoningReplayExactToolValues(t *testing.T) {
	m, err := replay.Project(json.RawMessage(replayFixture), convmeta.ReasoningReplayOptions{})
	require.NoError(t, err)
	for _, tc := range []struct {
		arguments string
		valid     bool
	}{
		{`{ "n":9007199254740993.0 }`, true},
		{`{"n":9007199254740992}`, false},
		{`{"n":9007199254740993,"n":9007199254740993}`, false},
		{`{"n":"9007199254740993"}`, false},
		{`{`, false},
	} {
		calls := m.ParseToolCalls()
		calls[0].Function.Arguments = tc.arguments
		m.ToolCalls, err = kitutil.Marshal(calls)
		require.NoError(t, err)
		_, err = replay.Restore(m, convmeta.ReasoningReplayOptions{})
		if tc.valid {
			require.NoError(t, err)
		} else {
			require.Error(t, err)
		}
	}
}
