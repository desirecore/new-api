package plugins_test

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relay"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAlibabaResponsesProtocol(t *testing.T) {
	source, err := builtinplugins.Source("alibaba")
	require.NoError(t, err)
	registry := jsplugin.NewRegistry()
	plugin, err := registry.RegisterFactory(source, jsplugin.Options{Key: "alibaba"})
	require.NoError(t, err)

	t.Run("claims every Ali model", func(t *testing.T) {
		for _, model := range plugin.Meta.Models {
			binding, found := registry.Generation().LookupEndpoint("POST", "/v1/responses", model)
			require.True(t, found, model)
			assert.Same(t, plugin, binding.Plugin)
			assert.Equal(t, "openai_responses", binding.Protocol)
		}
	})

	t.Run("claims deployed PR 4810 models", func(t *testing.T) {
		for _, model := range []string{
			"wan2.7-r2v",
			"wan2.7-videoedit",
			"happyhorse-1.0-t2v",
			"happyhorse-1.0-i2v",
			"happyhorse-1.0-r2v",
			"happyhorse-1.0-video-edit",
		} {
			assert.Contains(t, plugin.Meta.Models, model)
		}
	})

	t.Run("declares documented usage facts", func(t *testing.T) {
		require.Len(t, plugin.Meta.UsageSchema, 2)
		for _, key := range []string{"seconds", "resolution"} {
			schema, exists := plugin.Meta.UsageSchema[key]
			require.True(t, exists, key)
			assert.NotEmpty(t, schema.Description, key)
		}

		value, callErr := plugin.Engine.Call(t.Context(), "extractUsage", map[string]any{
			"model":         "wan2.5-i2v-preview",
			"upstreamModel": "wan2.5-i2v-preview",
			"usagePurpose":  "facts",
			"requestBody": map[string]any{
				"model":    "wan2.5-i2v-preview",
				"duration": 10,
				"size":     "1080p",
				"image":    "https://cdn.example/first.png",
			},
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var facts map[string]any
		require.NoError(t, common.Unmarshal(encoded, &facts))
		assert.Equal(t, map[string]any{"seconds": float64(10), "resolution": "1080P"}, facts)
	})

	t.Run("parses text input and options", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
			"model": "wan2.7-t2v", "body": map[string]any{"kind": "json", "value": map[string]any{
				"model":    "wan2.7-t2v",
				"input":    "waves at sunset",
				"size":     "1280*720",
				"duration": 6,
				"metadata": map[string]any{"parameters": map[string]any{"watermark": true}},
			}},
			"stream": false,
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))

		assert.Equal(t, map[string]any{
			"kind":   "submit",
			"model":  "wan2.7-t2v",
			"action": "text_to_video",
			"requestBody": map[string]any{
				"model":    "wan2.7-t2v",
				"prompt":   "waves at sunset",
				"size":     "1280*720",
				"duration": float64(6),
				"metadata": map[string]any{"parameters": map[string]any{"watermark": true}},
			},
		}, resolved)
	})

	t.Run("parses multimodal image input", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
			"model": "wan2.7-i2v", "body": map[string]any{"kind": "json", "value": map[string]any{
				"model": "wan2.7-i2v",
				"input": []any{
					map[string]any{
						"role": "user",
						"content": []any{
							map[string]any{"type": "input_text", "text": "animate between frames"},
							map[string]any{"type": "input_image", "image_url": "https://cdn.example/first.png"},
							map[string]any{"type": "input_image", "image_url": map[string]any{"url": "https://cdn.example/last.png"}},
						},
					},
				},
			}},
			"stream": true,
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))

		assert.Equal(t, "wan2.7-i2v", resolved["model"])
		assert.Equal(t, "image_to_video", resolved["action"])
		requestBody, ok := resolved["requestBody"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "animate between frames", requestBody["prompt"])
		assert.Equal(t, []any{"https://cdn.example/first.png", "https://cdn.example/last.png"}, requestBody["images"])
	})

	t.Run("accepts image-only i2v input", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
			"model": "wan2.7-i2v", "body": map[string]any{"kind": "json", "value": map[string]any{
				"model": "wan2.7-i2v",
				"input": []any{
					map[string]any{"type": "input_image", "image_url": "https://cdn.example/first.png"},
				},
			}},
			"stream": false,
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))

		assert.Equal(t, "image_to_video", resolved["action"])
		requestBody, ok := resolved["requestBody"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "", requestBody["prompt"])
		assert.Equal(t, []any{"https://cdn.example/first.png"}, requestBody["images"])
	})

	t.Run("maps wan2.7 first frame last frame and audio media", func(t *testing.T) {
		value, callErr := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
			"baseUrl":       "https://dashscope.example",
			"apiKey":        "secret",
			"model":         "wan2.7-i2v",
			"upstreamModel": "wan2.7-i2v",
			"requestBody": map[string]any{
				"model":     "wan2.7-i2v",
				"prompt":    "animate between frames",
				"images":    []any{"https://cdn.example/first.png", "https://cdn.example/last.png"},
				"audio_url": "https://cdn.example/voice.mp3",
			},
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var request map[string]any
		require.NoError(t, common.Unmarshal(encoded, &request))

		body, ok := request["body"].(map[string]any)
		require.True(t, ok)
		input, ok := body["input"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, []any{
			map[string]any{"type": "first_frame", "url": "https://cdn.example/first.png"},
			map[string]any{"type": "last_frame", "url": "https://cdn.example/last.png"},
			map[string]any{"type": "driving_audio", "url": "https://cdn.example/voice.mp3"},
		}, input["media"])
		assert.NotContains(t, input, "img_url")
		parameters, ok := body["parameters"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "720P", parameters["resolution"])
	})

	t.Run("maps HappyHorse reference media and legacy billing ratio", func(t *testing.T) {
		ctx := map[string]any{
			"baseUrl":       "https://dashscope.example",
			"apiKey":        "secret",
			"model":         "happyhorse-1.0-r2v",
			"upstreamModel": "happyhorse-1.0-r2v",
			"requestBody": map[string]any{
				"model":     "happyhorse-1.0-r2v",
				"prompt":    "keep this character",
				"image_url": []any{"https://cdn.example/reference.png"},
				"video_url": []any{"https://cdn.example/reference.mp4"},
				"audio_url": []any{"https://cdn.example/voice.mp3"},
				"duration":  8,
			},
		}
		value, callErr := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var request map[string]any
		require.NoError(t, common.Unmarshal(encoded, &request))
		assert.Equal(t, "image_to_video", request["action"])

		body, ok := request["body"].(map[string]any)
		require.True(t, ok)
		input, ok := body["input"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, []any{
			map[string]any{"type": "reference_image", "url": "https://cdn.example/reference.png"},
			map[string]any{"type": "reference_video", "url": "https://cdn.example/reference.mp4"},
			map[string]any{"type": "driving_audio", "url": "https://cdn.example/voice.mp3"},
		}, input["media"])
		parameters, ok := body["parameters"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "1080P", parameters["resolution"])

		ctx["usagePurpose"] = "billing_ratios"
		usageValue, usageErr := plugin.Engine.Call(t.Context(), "extractUsage", ctx)
		require.NoError(t, usageErr)
		usageEncoded, marshalUsageErr := common.Marshal(usageValue)
		require.NoError(t, marshalUsageErr)
		var ratios map[string]float64
		require.NoError(t, common.Unmarshal(usageEncoded, &ratios))
		assert.Equal(t, float64(8), ratios["seconds"])
		assert.InDelta(t, 1.6/0.9, ratios["resolution-1080P"], 0.000001)
	})

	t.Run("maps video edit input to video media", func(t *testing.T) {
		value, callErr := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
			"baseUrl":       "https://dashscope.example",
			"apiKey":        "secret",
			"model":         "wan2.7-videoedit",
			"upstreamModel": "wan2.7-videoedit",
			"requestBody": map[string]any{
				"model":     "wan2.7-videoedit",
				"prompt":    "replace the background",
				"image_url": "https://cdn.example/reference.png",
				"video_url": "https://cdn.example/source.mp4",
			},
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var request map[string]any
		require.NoError(t, common.Unmarshal(encoded, &request))
		body := request["body"].(map[string]any)
		input := body["input"].(map[string]any)
		assert.Equal(t, []any{
			map[string]any{"type": "reference_image", "url": "https://cdn.example/reference.png"},
			map[string]any{"type": "video", "url": "https://cdn.example/source.mp4"},
		}, input["media"])
	})

	t.Run("preserves multipart media URL fields", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model": "happyhorse-1.0-r2v",
			"body": map[string]any{
				"kind": "multipart",
				"fields": map[string]any{
					"prompt":    []any{"keep this subject"},
					"image_url": []any{"https://cdn.example/reference-1.png", "https://cdn.example/reference-2.png"},
					"video_url": []any{"https://cdn.example/reference.mp4"},
					"audio_url": []any{"https://cdn.example/voice.mp3"},
				},
				"files": []any{},
			},
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))
		assert.Equal(t, "image_to_video", resolved["action"])
		requestBody := resolved["requestBody"].(map[string]any)
		assert.Equal(t, []any{"https://cdn.example/reference-1.png", "https://cdn.example/reference-2.png"}, requestBody["image_url"])
		assert.Equal(t, []any{"https://cdn.example/reference.mp4"}, requestBody["video_url"])
		assert.Equal(t, []any{"https://cdn.example/voice.mp3"}, requestBody["audio_url"])
	})

	t.Run("preserves native new-format input", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "native", []string{"createVideoTask"}, map[string]any{
			"body": map[string]any{"kind": "json", "value": map[string]any{
				"model": "happyhorse-1.0-video-edit",
				"input": map[string]any{
					"prompt": "edit this clip",
					"media":  []any{map[string]any{"type": "video", "url": "https://cdn.example/source.mp4"}},
				},
				"parameters": map[string]any{"resolution": "1080P", "duration": 10, "audio_setting": "origin"},
			}},
		})
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))
		requestBody := resolved["requestBody"].(map[string]any)
		metadata := requestBody["metadata"].(map[string]any)
		input := metadata["input"].(map[string]any)
		assert.Equal(t, []any{map[string]any{"type": "video", "url": "https://cdn.example/source.mp4"}}, input["media"])
		parameters := metadata["parameters"].(map[string]any)
		assert.Equal(t, "origin", parameters["audio_setting"])
	})

	t.Run("accepts decimal completion duration", func(t *testing.T) {
		value, callErr := plugin.Engine.Call(
			t.Context(),
			"extractUsageOnComplete",
			map[string]any{},
			map[string]any{},
			map[string]any{"output": map[string]any{"duration": 20.02, "resolution": "1080p"}},
		)
		require.NoError(t, callErr)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var facts map[string]any
		require.NoError(t, common.Unmarshal(encoded, &facts))
		assert.Equal(t, float64(20.02), facts["seconds"])
		assert.Equal(t, "1080P", facts["resolution"])
	})

	t.Run("rejects a request without input text", func(t *testing.T) {
		_, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
			"model": "wan2.7-t2v", "body": map[string]any{"kind": "json", "value": map[string]any{"model": "wan2.7-t2v"}},
			"stream": false,
		})
		require.ErrorContains(t, callErr, "input is required")
	})

	protocolContext := map[string]any{
		"requestBody": map[string]any{"model": "wan2.7-t2v"},
		"stream":      true,
		"artifacts": map[string]any{
			"video": map[string]any{
				"key":      "video",
				"type":     "video",
				"mimeType": "video/mp4",
				"url":      "https://gateway.example/v1/tasks/task_public/artifacts/video/content?access=host%2Bcapability%3D",
			},
		},
	}
	successTask := map[string]any{
		"task_id":    "task_public",
		"status":     "SUCCESS",
		"progress":   "100%",
		"created_at": 10,
		"updated_at": 20,
		"data": map[string]any{
			"output": map[string]any{
				"video_url": "https://upstream.example/video.mp4?Expires=1&Signature=must-not-leak",
			},
		},
	}

	t.Run("renders stream semantics accepted by the host", func(t *testing.T) {
		progressValue, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "renderEvents"}, protocolContext, map[string]any{
			"task_id":  "task_public",
			"status":   "IN_PROGRESS",
			"progress": "42%",
		})
		require.NoError(t, callErr)
		progressResult, decodeErr := relay.DecodePluginProtocolEventResult(progressValue, relay.DefaultPluginProtocolLimits())
		require.NoError(t, decodeErr)
		require.Len(t, progressResult.Events, 1)
		require.NotNil(t, progressResult.Events[0].Progress)
		assert.Equal(t, float64(42), *progressResult.Events[0].Progress)
		assert.False(t, progressResult.Done)

		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "renderEvents"}, protocolContext, successTask)
		require.NoError(t, callErr)
		result, decodeErr := relay.DecodePluginProtocolEventResult(value, relay.DefaultPluginProtocolLimits())
		require.NoError(t, decodeErr)
		require.Len(t, result.Events, 1)
		assert.Equal(t, "output", result.Events[0].Type)
		assert.True(t, result.Done)
		var text string
		require.NoError(t, common.Unmarshal(result.Events[0].Data, &text))
		assert.Equal(t, `<video controls src="https://gateway.example/v1/tasks/task_public/artifacts/video/content?access=host%2Bcapability%3D"></video>`, text)
		assert.NotContains(t, text, "upstream.example")

		machine := relay.NewPluginResponsesMachine("task_public", "wan2.7-t2v", 10, relay.DefaultPluginProtocolLimits())
		_, machineErr := machine.CreatedEvent()
		require.NoError(t, machineErr)
		wireEvents, machineErr := machine.ApplyTick(result, "SUCCESS")
		require.NoError(t, machineErr)
		require.NotEmpty(t, wireEvents)
		assert.Equal(t, "response.completed", wireEvents[len(wireEvents)-1].Type)
	})

	t.Run("renders a valid non-stream response", func(t *testing.T) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "renderFinal"}, protocolContext, successTask)
		require.NoError(t, callErr)
		machine := relay.NewPluginResponsesMachine("task_public", "wan2.7-t2v", 10, relay.DefaultPluginProtocolLimits())
		response, finalErr := machine.FinalResponse(value, "SUCCESS")
		require.NoError(t, finalErr)
		assert.Equal(t, "resp_public", response["id"])
		assert.Equal(t, "completed", response["status"])

		output, ok := response["output"].([]any)
		require.True(t, ok)
		require.Len(t, output, 1)
		item, ok := output[0].(map[string]any)
		require.True(t, ok)
		content, ok := item["content"].([]any)
		require.True(t, ok)
		require.Len(t, content, 1)
		part, ok := content[0].(map[string]any)
		require.True(t, ok)
		text, ok := part["text"].(string)
		require.True(t, ok)
		assert.Equal(t, `<video controls src="https://gateway.example/v1/tasks/task_public/artifacts/video/content?access=host%2Bcapability%3D"></video>`, text)
		assert.NotContains(t, text, "upstream.example")
		metadata, ok := response["metadata"].(map[string]string)
		require.True(t, ok)
		assert.Equal(t, "ali", metadata["vendor"])
	})

	t.Run("does not fall back to the upstream URL when the host artifact is absent", func(t *testing.T) {
		_, callErr := plugin.Engine.CallPath(
			t.Context(),
			"protocols",
			[]string{"openai_responses", "renderFinal"},
			map[string]any{
				"requestBody": map[string]any{"model": "wan2.7-t2v"},
				"stream":      false,
			},
			successTask,
		)
		require.ErrorContains(t, callErr, "video artifact is unavailable")
		assert.NotContains(t, callErr.Error(), "upstream.example")
	})
}
