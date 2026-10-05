// Package replay validates the fixed assistant content snapshot transport.
package replay

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

const Header = "X-New-Api-Reasoning-Transport"
const Invalid = "invalid_reasoning_replay"
const Mismatch = "reasoning_replay_mismatch"
const TooLarge = "reasoning_replay_too_large"
const Required = "reasoning_replay_required"
const Unrepresentable = "reasoning_replay_unrepresentable"
const Unsupported = "reasoning_replay_unsupported_route"

type Error struct {
	Code string
	Path string
}

func (e *Error) Error() string { return e.Code + ": " + e.Path }

func Limits(o convmeta.ReasoningReplayOptions) (convmeta.ReasoningReplayOptions, error) {
	defaults := convmeta.ReasoningReplayOptions{MaxMessageBytes: 1 << 20, MaxRequestBytes: 8 << 20, MaxBlocks: 256}
	for _, p := range []struct {
		value *int
		max   int
	}{{&o.MaxMessageBytes, defaults.MaxMessageBytes}, {&o.MaxRequestBytes, defaults.MaxRequestBytes}, {&o.MaxBlocks, defaults.MaxBlocks}} {
		if *p.value < 0 || *p.value > p.max {
			return o, &Error{Invalid, "limits"}
		}
		if *p.value == 0 {
			*p.value = p.max
		}
	}
	return o, nil
}

// Object rejects duplicate keys, unsupported fields and non-object JSON. Paths
// are supplied by the caller, never derived from untrusted keys or values.
func Object(raw []byte, path string, allowed ...string) (map[string]json.RawMessage, error) {
	value, err := kitutil.ExactJSONValue(raw)
	if err != nil {
		return nil, &Error{Invalid, path}
	}
	if _, ok := value.(map[string]any); !ok {
		return nil, &Error{Invalid, path}
	}
	var object map[string]json.RawMessage
	if err := kitutil.Unmarshal(raw, &object); err != nil {
		return nil, &Error{Invalid, path}
	}
	for key := range object {
		found := false
		for _, name := range allowed {
			if key == name {
				found = true
				break
			}
		}
		if !found {
			return nil, &Error{Invalid, path}
		}
	}
	return object, nil
}

func stringField(object map[string]json.RawMessage, key, path string) (string, error) {
	raw := object[key]
	if kitutil.GetJsonType(raw) != "string" {
		return "", &Error{Invalid, path + "." + key}
	}
	var value string
	if err := kitutil.Unmarshal(raw, &value); err != nil {
		return "", &Error{Invalid, path + "." + key}
	}
	return value, nil
}

func Project(content json.RawMessage, limits convmeta.ReasoningReplayOptions) (dto.Message, error) {
	message := dto.Message{Role: "assistant"}
	limits, err := Limits(limits)
	if err != nil {
		return message, err
	}
	envelope := &dto.ReasoningReplay{Version: 1, Source: "anthropic_messages", Content: content}
	encoded, err := kitutil.Marshal(envelope)
	if err != nil {
		return message, &Error{Invalid, "newapi_reasoning.content"}
	}
	if len(encoded) > limits.MaxMessageBytes {
		return message, &Error{TooLarge, "newapi_reasoning"}
	}
	if _, err := kitutil.ExactJSONValue(content); err != nil || kitutil.GetJsonType(content) != "array" {
		return message, &Error{Invalid, "newapi_reasoning.content"}
	}
	var blocks []json.RawMessage
	if err := kitutil.Unmarshal(content, &blocks); err != nil {
		return message, &Error{Invalid, "newapi_reasoning.content"}
	}
	if len(blocks) > limits.MaxBlocks {
		return message, &Error{TooLarge, "newapi_reasoning.content"}
	}
	var text, thinking strings.Builder
	hasText, hasThinking := false, false
	var tools []dto.ToolCallRequest
	ids := map[string]bool{}
	for i, raw := range blocks {
		path := fmt.Sprintf("newapi_reasoning.content[%d]", i)
		var kind struct {
			Type string `json:"type"`
		}
		if err := kitutil.Unmarshal(raw, &kind); err != nil {
			return message, &Error{Invalid, path}
		}
		var fields []string
		switch kind.Type {
		case "text":
			fields = []string{"type", "text"}
		case "thinking":
			fields = []string{"type", "thinking", "signature"}
		case "redacted_thinking":
			fields = []string{"type", "data"}
		case "tool_use":
			fields = []string{"type", "id", "name", "input"}
		default:
			return message, &Error{Invalid, path + ".type"}
		}
		object, err := Object(raw, path, fields...)
		if err != nil {
			return message, err
		}
		switch kind.Type {
		case "text":
			value, err := stringField(object, "text", path)
			if err != nil {
				return message, err
			}
			text.WriteString(value)
			hasText = true
		case "thinking":
			value, err := stringField(object, "thinking", path)
			if err != nil {
				return message, err
			}
			thinking.WriteString(value)
			hasThinking = true
			if _, exists := object["signature"]; exists {
				if _, err := stringField(object, "signature", path); err != nil {
					return message, err
				}
			}
		case "redacted_thinking":
			if _, err := stringField(object, "data", path); err != nil {
				return message, err
			}
		case "tool_use":
			id, err := stringField(object, "id", path)
			if err != nil {
				return message, err
			}
			name, err := stringField(object, "name", path)
			if err != nil {
				return message, err
			}
			if id == "" || name == "" || ids[id] {
				return message, &Error{Invalid, path}
			}
			ids[id] = true
			if kitutil.GetJsonType(object["input"]) != "object" {
				return message, &Error{Invalid, path + ".input"}
			}
			tools = append(tools, dto.ToolCallRequest{ID: id, Type: "function", Function: dto.FunctionRequest{Name: name, Arguments: string(object["input"])}})
		}
	}
	if hasText {
		message.Content = text.String()
	}
	if hasThinking {
		message.ReasoningContent = kitutil.GetPointer(thinking.String())
	}
	if len(tools) > 0 {
		message.ToolCalls, err = kitutil.Marshal(tools)
		if err != nil {
			return message, &Error{Invalid, "tool_calls"}
		}
	}
	envelope.Content = append(json.RawMessage(nil), content...)
	message.NewAPIReasoning = envelope
	return message, nil
}

func Restore(message dto.Message, limits convmeta.ReasoningReplayOptions) (json.RawMessage, error) {
	if message.Role != "assistant" || message.NewAPIReasoning == nil {
		return nil, &Error{Invalid, "newapi_reasoning"}
	}
	envelope := message.NewAPIReasoning
	if envelope.Version != 1 || envelope.Source != "anthropic_messages" {
		return nil, &Error{Invalid, "newapi_reasoning"}
	}
	if len(envelope.RawJSON) > 0 {
		if _, err := Object(envelope.RawJSON, "newapi_reasoning", "version", "source", "content"); err != nil {
			return nil, err
		}
	}
	if err := validateRawMessage(message); err != nil {
		return nil, err
	}
	projected, err := Project(envelope.Content, limits)
	if err != nil {
		return nil, err
	}
	if !reflect.DeepEqual(message.Content, projected.Content) {
		return nil, &Error{Mismatch, "content"}
	}
	if !reflect.DeepEqual(message.ReasoningContent, projected.ReasoningContent) {
		return nil, &Error{Mismatch, "reasoning_content"}
	}
	if message.Reasoning != nil && !reflect.DeepEqual(message.Reasoning, message.ReasoningContent) {
		return nil, &Error{Mismatch, "reasoning"}
	}
	if message.Name != nil || message.Prefix != nil || message.ToolCallId != "" || len(message.Tools) > 0 || len(message.Annotations) > 0 {
		return nil, &Error{Mismatch, "message"}
	}
	var actual, expected []json.RawMessage
	if len(message.ToolCalls) > 0 {
		if kitutil.GetJsonType(message.ToolCalls) != "array" {
			return nil, &Error{Mismatch, "tool_calls"}
		}
		if err := kitutil.Unmarshal(message.ToolCalls, &actual); err != nil {
			return nil, &Error{Invalid, "tool_calls"}
		}
	}
	if len(projected.ToolCalls) > 0 {
		if err := kitutil.Unmarshal(projected.ToolCalls, &expected); err != nil {
			return nil, &Error{Invalid, "tool_calls"}
		}
	}
	if len(actual) != len(expected) {
		return nil, &Error{Mismatch, "tool_calls"}
	}
	for i, raw := range actual {
		path := fmt.Sprintf("tool_calls[%d]", i)
		object, err := Object(raw, path, "id", "type", "function")
		if err != nil {
			return nil, err
		}
		if _, err := Object(object["function"], path+".function", "name", "arguments"); err != nil {
			return nil, err
		}
		var a, b dto.ToolCallRequest
		if err := kitutil.Unmarshal(raw, &a); err != nil {
			return nil, &Error{Invalid, path}
		}
		if err := kitutil.Unmarshal(expected[i], &b); err != nil {
			return nil, &Error{Invalid, path}
		}
		if a.ID != b.ID || a.Type != b.Type || a.Function.Name != b.Function.Name {
			return nil, &Error{Mismatch, path}
		}
		equal, err := kitutil.JSONValuesEqual([]byte(a.Function.Arguments), []byte(b.Function.Arguments))
		if err != nil {
			return nil, &Error{Invalid, path + ".function.arguments"}
		}
		if !equal {
			return nil, &Error{Mismatch, path + ".function.arguments"}
		}
	}
	return append(json.RawMessage(nil), envelope.Content...), nil
}

func validateRawMessage(message dto.Message) error {
	if len(message.RawReplayMessage) == 0 {
		return nil
	}
	if _, err := kitutil.ExactJSONValue(message.RawReplayMessage); err != nil {
		return &Error{Invalid, "message"}
	}
	var fields map[string]json.RawMessage
	if err := kitutil.Unmarshal(message.RawReplayMessage, &fields); err != nil {
		return &Error{Invalid, "message"}
	}
	for _, name := range []string{"newapi_reasoning", "reasoning_content", "reasoning"} {
		if raw, exists := fields[name]; exists && kitutil.GetJsonType(raw) == "null" {
			return &Error{Invalid, name}
		}
	}
	return nil
}

// HasExtension also recognizes explicit null, which a typed pointer alone loses.
func HasExtension(message dto.Message) bool {
	if message.NewAPIReasoning != nil {
		return true
	}
	if len(message.RawReplayMessage) == 0 {
		return false
	}
	var fields map[string]json.RawMessage
	_ = kitutil.Unmarshal(message.RawReplayMessage, &fields)
	_, exists := fields["newapi_reasoning"]
	return exists
}

func ValidateRequest(request *dto.GeneralOpenAIRequest, limits convmeta.ReasoningReplayOptions) error {
	limits, err := Limits(limits)
	if err != nil {
		return err
	}
	total := 0
	for i, message := range request.Messages {
		if err := validateRawMessage(message); err != nil {
			return err
		}
		if HasExtension(message) {
			if _, err := Restore(message, limits); err != nil {
				return err
			}
			encoded, err := kitutil.Marshal(message.NewAPIReasoning)
			if err != nil {
				return &Error{Invalid, "newapi_reasoning"}
			}
			total += len(encoded)
			if total > limits.MaxRequestBytes {
				return &Error{TooLarge, "messages"}
			}
		} else if message.Role == "assistant" && (message.ReasoningContent != nil || message.Reasoning != nil) {
			return &Error{Required, fmt.Sprintf("messages[%d]", i)}
		}
		if i > 0 && message.Role == "assistant" && request.Messages[i-1].Role == "assistant" && (HasExtension(message) || HasExtension(request.Messages[i-1])) {
			return &Error{Invalid, "messages"}
		}
	}
	return nil
}
