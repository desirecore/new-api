package dto

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

// ReasoningReplay preserves the original assistant block sequence. It is local
// transport metadata, never an upstream Chat Completions request parameter.
type ReasoningReplay struct {
	Version int             `json:"version"`
	Source  string          `json:"source"`
	Content json.RawMessage `json:"content"`
	RawJSON json.RawMessage `json:"-"`
}

func (r *ReasoningReplay) UnmarshalJSON(data []byte) error {
	type plain ReasoningReplay
	var decoded plain
	if err := kitutil.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*r = ReasoningReplay(decoded)
	r.RawJSON = append(json.RawMessage(nil), data...)
	return nil
}

func (m *Message) UnmarshalJSON(data []byte) error {
	type plain Message
	var decoded plain
	if err := kitutil.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*m = Message(decoded)
	// Only retain raw message data when transport metadata or reasoning is present.
	var fields map[string]json.RawMessage
	if err := kitutil.Unmarshal(data, &fields); err != nil {
		return err
	}
	if fields["newapi_reasoning"] != nil || fields["reasoning_content"] != nil || fields["reasoning"] != nil {
		m.RawReplayMessage = append(json.RawMessage(nil), data...)
	}
	return nil
}

// UnmarshalJSON keeps the upstream event before typed decoding drops unknown
// block fields. Replay validation consumes this data; ordinary paths are unchanged.
func (c *ClaudeResponse) UnmarshalJSON(data []byte) error {
	type plain ClaudeResponse
	var decoded plain
	if err := kitutil.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*c = ClaudeResponse(decoded)
	c.RawJSON = append(json.RawMessage(nil), data...)
	return nil
}

// The embedded Message must not promote its JSON decoder onto the choice.
func (c *OpenAITextResponseChoice) UnmarshalJSON(data []byte) error {
	var value struct {
		Index        int     `json:"index"`
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	}
	if err := kitutil.Unmarshal(data, &value); err != nil {
		return err
	}
	c.Index = value.Index
	c.Message = value.Message
	c.FinishReason = value.FinishReason
	return nil
}
