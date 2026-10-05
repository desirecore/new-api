package relayconvert

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/replay"
	"github.com/QuantumNous/new-api/relaykit/types"
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

func TestReasoningReplayStreamParity(t *testing.T) {
	for _, content := range []string{replayFixture, `[]`, `[{"type":"text","text":""}]`, `[{"type":"thinking","thinking":"","signature":"opaque"}]`, `[{"type":"tool_use","id":"one","name":"f","input":{}},{"type":"text","text":"between"},{"type":"tool_use","id":"two","name":"f","input":{"x":2}}]`} {
		for _, split := range []bool{false, true} {
			var response dto.ClaudeResponse
			require.NoError(t, kitutil.Unmarshal([]byte(`{"type":"message","role":"assistant","stop_reason":"end_turn","content":`+content+`}`), &response))
			nonstream, err := ResponseClaude2OpenAIWithOptions(&response, &convmeta.ReasoningReplayOptions{})
			require.NoError(t, err)
			state := NewClaudeToChatStreamStateWithOptions(&convmeta.ReasoningReplayOptions{})
			var chunks []*dto.ChatCompletionsStreamResponse
			var blocks []json.RawMessage
			require.NoError(t, kitutil.Unmarshal([]byte(content), &blocks))
			events := []string{`{"type":"message_start","message":{"id":"id","role":"assistant","content":[],"model":"model"}}`}
			for i, block := range blocks {
				if split {
					var fields map[string]json.RawMessage
					require.NoError(t, kitutil.Unmarshal(block, &fields))
					var kind string
					require.NoError(t, kitutil.Unmarshal(fields["type"], &kind))
					var deltas []string
					for _, field := range []string{"text", "thinking", "signature", "input"} {
						value, exists := fields[field]
						if !exists {
							continue
						}
						if field == "input" {
							fields[field] = json.RawMessage(`{}`)
							value, _ = kitutil.Marshal(string(value))
							deltas = append(deltas, `{"type":"input_json_delta","partial_json":`+string(value)+`}`)
						} else {
							fields[field] = json.RawMessage(`""`)
							deltas = append(deltas, `{"type":"`+field+`_delta","`+field+`":`+string(value)+`}`)
						}
					}
					if kind == "redacted_thinking" {
						deltas = nil
					}
					start, err := kitutil.Marshal(fields)
					require.NoError(t, err)
					events = append(events, fmt.Sprintf(`{"type":"content_block_start","index":%d,"content_block":%s}`, i, start))
					for _, delta := range deltas {
						events = append(events, fmt.Sprintf(`{"type":"content_block_delta","index":%d,"delta":%s}`, i, delta))
					}
				} else {
					events = append(events, fmt.Sprintf(`{"type":"content_block_start","index":%d,"content_block":%s}`, i, block))
				}
				events = append(events, fmt.Sprintf(`{"type":"content_block_stop","index":%d}`, i))
			}
			events = append(events, `{"type":"ping"}`, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}`, `{"type":"message_stop"}`)
			for i, event := range events {
				var response dto.ClaudeResponse
				require.NoError(t, kitutil.Unmarshal([]byte(event), &response))
				chunk, err := state.ConvertChunk(&response)
				require.NoError(t, err, event)
				if chunk == nil {
					continue
				}
				chunks = append(chunks, chunk)
				if i < len(events)-1 {
					for _, choice := range chunk.Choices {
						assert.Nil(t, choice.FinishReason)
						assert.Nil(t, choice.Delta.NewAPIReasoning)
					}
				}
			}
			require.NoError(t, state.Finalize())
			final := chunks[len(chunks)-1].Choices[0]
			require.NotNil(t, final.Delta.NewAPIReasoning)
			require.NotNil(t, final.FinishReason)
			equal, err := kitutil.JSONValuesEqual([]byte(content), final.Delta.NewAPIReasoning.Content)
			require.NoError(t, err)
			assert.True(t, equal)
			message := dto.Message{Role: "assistant", NewAPIReasoning: final.Delta.NewAPIReasoning}
			var calls []dto.ToolCallResponse
			for _, chunk := range chunks {
				for _, choice := range chunk.Choices {
					delta := choice.Delta
					if delta.Content != nil {
						if message.Content == nil {
							message.Content = ""
						}
						message.Content = message.Content.(string) + *delta.Content
					}
					if delta.ReasoningContent != nil {
						if message.ReasoningContent == nil {
							message.ReasoningContent = kitutil.GetPointer("")
						}
						*message.ReasoningContent += *delta.ReasoningContent
					}
					for _, call := range delta.ToolCalls {
						require.NotNil(t, call.Index)
						idx := *call.Index
						for len(calls) <= idx {
							calls = append(calls, dto.ToolCallResponse{})
						}
						if call.ID != "" {
							calls[idx].ID = call.ID
							calls[idx].Type = call.Type
							calls[idx].Function.Name = call.Function.Name
						}
						calls[idx].Function.Arguments += call.Function.Arguments
					}
				}
			}
			if len(calls) > 0 {
				for i := range calls {
					calls[i].Index = nil
				}
				message.ToolCalls, err = kitutil.Marshal(calls)
				require.NoError(t, err)
			}
			_, err = replay.Restore(message, convmeta.ReasoningReplayOptions{})
			require.NoError(t, err)
			assert.Equal(t, nonstream.Choices[0].Message.Content, message.Content)
			assert.Equal(t, nonstream.Choices[0].Message.ReasoningContent, message.ReasoningContent)
		}
	}
}

func TestReasoningReplayStreamTerminal(t *testing.T) {
	for _, events := range [][]string{
		{`{"type":"message_stop"}`},
		{`{"type":"message_start","message":{"content":[]}}`, `{"type":"message_stop"}`},
		{`{"type":"message_start","message":{"content":[]}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"x"}}`},
		{`{"type":"message_start","message":{"content":[]}}`, `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":"","citations":[]}}`},
		{`{"type":"message_start","message":{"content":[]}}`, `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"future_delta","text":""}}`},
	} {
		state := NewClaudeToChatStreamStateWithOptions(&convmeta.ReasoningReplayOptions{})
		var err error
		for _, event := range events {
			var r dto.ClaudeResponse
			require.NoError(t, kitutil.Unmarshal([]byte(event), &r))
			_, err = state.ConvertChunk(&r)
			if err != nil {
				break
			}
		}
		require.Error(t, err)
		require.Error(t, state.Finalize())
	}
	for _, raw := range []string{`[{"type":"text","text":"","unknown":"sentinel"}]`, `[{"type":"thinking","thinking":null}]`} {
		var r dto.ClaudeResponse
		require.NoError(t, kitutil.Unmarshal([]byte(`{"content":`+raw+`}`), &r))
		_, err := ResponseClaude2OpenAIWithOptions(&r, &convmeta.ReasoningReplayOptions{})
		require.Error(t, err)
		assert.NotContains(t, err.Error(), "sentinel")
	}
	state := NewClaudeToChatStreamStateWithOptions(&convmeta.ReasoningReplayOptions{})
	require.Error(t, state.Finalize())
}

func TestReasoningReplayRegistryTerminal(t *testing.T) {
	info := &convmeta.Values{Options: &convmeta.Options{ReasoningReplay: &convmeta.ReasoningReplayOptions{}}}
	state, err := NewResponseStreamState(types.RelayFormatClaude, types.RelayFormatOpenAI, ResponseStreamOptions{})
	require.NoError(t, err)
	for _, event := range []string{`{"type":"message_start","message":{"content":[]}}`, `{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}`} {
		var r dto.ClaudeResponse
		require.NoError(t, kitutil.Unmarshal([]byte(event), &r))
		results, err := ConvertStreamResponseChunk(nil, info, state, &r)
		require.NoError(t, err)
		for _, result := range results {
			chunk := result.Value.(*dto.ChatCompletionsStreamResponse)
			for _, choice := range chunk.Choices {
				require.Nil(t, choice.FinishReason)
			}
		}
	}
	_, err = FinalizeStreamResponse(nil, info, state)
	require.Error(t, err)
	results, err := ConvertStreamResponseChunk(nil, info, state, &dto.ClaudeResponse{Type: "message_stop"})
	require.NoError(t, err)
	require.Len(t, results, 1)
	chunk := results[0].Value.(*dto.ChatCompletionsStreamResponse)
	assert.Equal(t, "length", *chunk.Choices[0].FinishReason)
	require.NotNil(t, chunk.Choices[0].Delta.NewAPIReasoning)
	_, err = FinalizeStreamResponse(nil, info, state)
	require.NoError(t, err)
	_, err = ConvertStreamResponseChunk(nil, info, state, &dto.ClaudeResponse{Type: "message_stop"})
	require.Error(t, err)
}
