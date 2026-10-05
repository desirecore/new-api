package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/replay"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"net/http"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

func init() {
	relayconvert.SetMediaResolver(relayconvert.MediaResolver{
		// relayconvert is gin-free; recover the gin context when the caller
		// passed one so file caching/cleanup keeps working.
		GetBase64Data: func(ctx context.Context, source types.FileSource, reason ...string) (string, string, error) {
			ginCtx, _ := ctx.(*gin.Context)
			return GetBase64Data(ginCtx, source, reason...)
		},
		DecodeBase64FileData: DecodeBase64FileData,
	})
}

func ConvertRequest(c *gin.Context, info *relaycommon.RelayInfo, target types.RelayFormat, request any) (*relayconvert.RequestResult, error) {
	result, err := relayconvert.ConvertRequest(c, info, target, request)
	if result != nil {
		info.RecordConversionDiagnostics(c, result.Diagnostics)
	}
	return result, err
}

func ConvertRequestByID(c *gin.Context, info *relaycommon.RelayInfo, converter string, request any) (*relayconvert.RequestResult, error) {
	result, err := relayconvert.ConvertRequestByID(c, info, converter, request)
	if result != nil {
		info.RecordConversionDiagnostics(c, result.Diagnostics)
	}
	return result, err
}

func ConvertRequestVia(c *gin.Context, info *relaycommon.RelayInfo, request any, path ...types.RelayFormat) (*relayconvert.RequestResult, error) {
	result, err := relayconvert.ConvertRequestVia(c, info, request, path...)
	if result != nil {
		info.RecordConversionDiagnostics(c, result.Diagnostics)
	}
	return result, err
}

func ClaudeToOpenAIRequest(claudeRequest dto.ClaudeRequest, info *relaycommon.RelayInfo) (*dto.GeneralOpenAIRequest, error) {
	result, err := ConvertRequest(nil, info, types.RelayFormatOpenAI, &claudeRequest)
	if err != nil {
		return nil, err
	}
	openAIRequest, ok := result.Value.(*dto.GeneralOpenAIRequest)
	if !ok {
		return nil, fmt.Errorf("expected OpenAI chat completions request, got %T", result.Value)
	}
	return openAIRequest, nil
}

func GeminiToOpenAIRequest(geminiRequest *dto.GeminiChatRequest, info *relaycommon.RelayInfo) (*dto.GeneralOpenAIRequest, error) {
	result, err := ConvertRequest(nil, info, types.RelayFormatOpenAI, geminiRequest)
	if err != nil {
		return nil, err
	}
	openAIRequest, ok := result.Value.(*dto.GeneralOpenAIRequest)
	if !ok {
		return nil, fmt.Errorf("expected OpenAI chat completions request, got %T", result.Value)
	}
	return openAIRequest, nil
}

// ValidateReasoningReplayBody runs before typed DTO decoding can discard fields.
func ValidateReasoningReplayBody(c *gin.Context, format types.RelayFormat) error {
	header := c.GetHeader(replay.Header)
	if header != "" && header != "v1" {
		return &replay.Error{Code: replay.Invalid, Path: "header"}
	}
	if header == "v1" && (format != types.RelayFormatOpenAI || c.Request.URL.Path != "/v1/chat/completions") {
		return &replay.Error{Code: replay.Unsupported, Path: "route"}
	}
	if header == "" && !strings.Contains(c.GetHeader("Content-Type"), "json") {
		return nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return err
	}
	raw, err := storage.Bytes()
	if err != nil {
		return err
	}
	var body map[string]json.RawMessage
	if err := common.Unmarshal(raw, &body); err != nil {
		if header != "" {
			return &replay.Error{Code: replay.Invalid, Path: "request"}
		}
		return nil
	}
	var messages []map[string]json.RawMessage
	_ = common.Unmarshal(body["messages"], &messages)
	hasExtension := body["newapi_reasoning"] != nil
	for _, message := range messages {
		if _, ok := message["newapi_reasoning"]; ok {
			hasExtension = true
		}
	}
	if header == "" {
		if hasExtension {
			return &replay.Error{Code: replay.Invalid, Path: "newapi_reasoning"}
		}
		return nil
	}
	if _, err := kitutil.ExactJSONValue(raw); err != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	if body["newapi_reasoning"] != nil {
		return &replay.Error{Code: replay.Invalid, Path: "newapi_reasoning"}
	}
	var request dto.GeneralOpenAIRequest
	if err := common.Unmarshal(raw, &request); err != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	return replay.ValidateRequest(&request, convmeta.ReasoningReplayOptions{})
}

// ValidateReasoningReplayRequest resolves the selected route before reserving
// funds, and runs again on each attempt. No global capability flag is involved.
func ValidateReasoningReplayRequest(c *gin.Context, info *relaycommon.RelayInfo) error {
	header := c.GetHeader(replay.Header)
	if header != "" && header != "v1" {
		return &replay.Error{Code: replay.Invalid, Path: "header"}
	}
	request, ok := info.Request.(*dto.GeneralOpenAIRequest)
	if header == "" {
		if ok {
			for _, message := range request.Messages {
				if replay.HasExtension(message) {
					return &replay.Error{Code: replay.Invalid, Path: "newapi_reasoning"}
				}
			}
		}
		return nil
	}
	if !ok || info.RelayFormat != types.RelayFormatOpenAI || info.RelayMode != relayconstant.RelayModeChatCompletions {
		return &replay.Error{Code: replay.Unsupported, Path: "route"}
	}
	info.ReasoningReplayEnabled = true
	info.InitChannelMeta(c)
	if info.ChannelType != constant.ChannelTypeAnthropic || model_setting.GetGlobalSettings().PassThroughRequestEnabled || info.ChannelSetting.PassThroughBodyEnabled || ShouldChatCompletionsUseResponsesGlobal(info.ChannelId, info.ChannelType, info.OriginModelName) {
		return &replay.Error{Code: replay.Unsupported, Path: "route"}
	}
	if err := replay.ValidateRequest(request, *info.ConvOptions().ReasoningReplay); err != nil {
		return err
	}
	// Overrides operate on the converted native body. Preview that exact stage
	// before billing, then recheck the real body immediately before sending it.
	converted, err := relayconvert.OpenAIChatRequestToClaudeMessages(c, info, *request)
	if err != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	if len(info.ParamOverride) > 0 {
		raw, err := common.Marshal(converted)
		if err != nil {
			return &replay.Error{Code: replay.Invalid, Path: "request"}
		}
		preview := *info
		overridden, err := relaycommon.ApplyParamOverrideWithRelayInfo(raw, &preview)
		if err != nil {
			return &replay.Error{Code: replay.Invalid, Path: "overrides"}
		}
		if err := ValidateReasoningReplayOutbound(converted, overridden); err != nil {
			return err
		}
	}
	return nil
}

func ValidateReasoningReplayOutbound(expected any, raw []byte) error {
	before, err := common.Marshal(expected)
	if err != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	var original, actual map[string]json.RawMessage
	if common.Unmarshal(before, &original) != nil || common.Unmarshal(raw, &actual) != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	if _, err := kitutil.ExactJSONValue(raw); err != nil {
		return &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	if actual["newapi_reasoning"] != nil {
		return &replay.Error{Code: replay.Invalid, Path: "newapi_reasoning"}
	}
	equal, err := kitutil.JSONValuesEqual(original["messages"], actual["messages"])
	if err != nil || !equal {
		return &replay.Error{Code: replay.Mismatch, Path: "messages"}
	}
	return nil
}

// ReasoningReplayError maps sanitized transport errors without retaining raw data.
func ReasoningReplayError(err error) *types.NewAPIError {
	var replayErr *replay.Error
	if !errors.As(err, &replayErr) {
		replayErr = &replay.Error{Code: replay.Invalid, Path: "request"}
	}
	status := http.StatusBadRequest
	if replayErr.Code == replay.TooLarge {
		status = http.StatusRequestEntityTooLarge
	}
	if replayErr.Code == replay.Unrepresentable {
		status = http.StatusBadGateway
	}
	return types.NewErrorWithStatusCode(replayErr, types.ErrorCode(replayErr.Code), status, types.ErrOptionWithSkipRetry())
}
