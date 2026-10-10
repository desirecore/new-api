package service

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	hostreasoning "github.com/QuantumNous/new-api/setting/reasoning"
	"slices"
	"strings"
)

var ErrTopologyNotFound = errors.New("model topology resource not found")

type TopologyDiagnostic struct {
	Code              string `json:"code"`
	Severity          string `json:"severity"`
	AffectedChannelID int    `json:"affected_channel_id,omitempty"`
}
type TopologyGroup struct {
	Name               string               `json:"name"`
	Sources            []string             `json:"sources"`
	Special            bool                 `json:"special"`
	ConfiguredModels   int                  `json:"configured_models"`
	ConfiguredChannels int                  `json:"configured_channels"`
	Diagnostics        []TopologyDiagnostic `json:"diagnostics"`
}
type TopologyModelSummary struct {
	Name               string               `json:"name"`
	ConfiguredChannels int                  `json:"configured_channels"`
	EnabledChannels    int                  `json:"enabled_channels"`
	PriorityLayers     int                  `json:"priority_layers"`
	ChannelIDs         []int                `json:"channel_ids"`
	HasMapping         bool                 `json:"has_mapping"`
	Diagnostics        []TopologyDiagnostic `json:"diagnostics"`
}
type TopologyModelQuery struct {
	Group, Keyword, ChannelKeyword, Status string
	ChannelID, Page, PageSize              int
	HasMapping, HasDiagnostics             *bool
}
type TopologyModelPage struct {
	Items       []TopologyModelSummary `json:"items"`
	Total       int                    `json:"total"`
	GroupTotal  int                    `json:"group_total"`
	Page        int                    `json:"page"`
	PageSize    int                    `json:"page_size"`
	ObservedAt  string                 `json:"observed_at"`
	Basis       string                 `json:"basis"`
	RuntimeMode string                 `json:"runtime_mode"`
}
type TopologyMapping struct {
	Names       []string             `json:"names"`
	Status      string               `json:"status"`
	Scope       string               `json:"scope"`
	Diagnostics []TopologyDiagnostic `json:"diagnostics"`
}
type TopologyChannel struct {
	ChannelID                int                  `json:"channel_id"`
	ChannelName              string               `json:"channel_name"`
	ChannelType              int                  `json:"channel_type"`
	ChannelStatus            int                  `json:"channel_status"`
	ConfiguredWeight         uint                 `json:"configured_weight"`
	Priority                 int64                `json:"priority"`
	AbilityConsistency       string               `json:"ability_consistency"`
	RelatedModelCountInGroup int                  `json:"related_model_count_in_group"`
	Mapping                  TopologyMapping      `json:"mapping"`
	Diagnostics              []TopologyDiagnostic `json:"diagnostics"`
}
type TopologyTier struct {
	Priority int64             `json:"priority"`
	Channels []TopologyChannel `json:"channels"`
}
type TopologyDetail struct {
	Group            string               `json:"group"`
	Model            string               `json:"model"`
	ObservedAt       string               `json:"observed_at"`
	Basis            string               `json:"basis"`
	RuntimeMode      string               `json:"runtime_mode"`
	Summary          TopologyModelSummary `json:"summary"`
	Tiers            []TopologyTier       `json:"tiers"`
	ExcludedChannels []TopologyChannel    `json:"excluded_channels"`
	Limitations      []string             `json:"limitations"`
}

// topologyIndex is request-scoped. Reading it never refreshes routing caches.
type topologyIndex struct {
	snapshot  *model.ModelTopologySnapshot
	groups    map[string]*TopologyGroup
	channels  map[string]map[string][]model.TopologyChannel
	abilities map[topologyRelation]model.Ability
	orphan    map[string]map[string][]TopologyDiagnostic
}
type topologyRelation struct {
	group, model string
	channel      int
}

func topologyTokens(raw string) []string {
	tokens := []string{}
	for token := range strings.SplitSeq(strings.Trim(raw, ","), ",") {
		if token != "" && !slices.Contains(tokens, token) {
			tokens = append(tokens, token)
		}
	}
	return tokens
}
func loadTopologyIndex() (*topologyIndex, error) {
	snapshot, err := model.LoadModelTopologySnapshot()
	if err != nil {
		return nil, err
	}
	idx := &topologyIndex{snapshot: snapshot, groups: map[string]*TopologyGroup{}, channels: map[string]map[string][]model.TopologyChannel{}, abilities: map[topologyRelation]model.Ability{}, orphan: map[string]map[string][]TopologyDiagnostic{}}
	for name := range snapshot.Groups {
		idx.addGroup(name, "config")
	}
	for _, ch := range snapshot.Channels {
		for _, group := range topologyTokens(ch.Group) {
			g := idx.addGroup(group, "channels")
			g.ConfiguredChannels++
			if idx.channels[group] == nil {
				idx.channels[group] = map[string][]model.TopologyChannel{}
			}
			for _, name := range topologyTokens(ch.Models) {
				idx.channels[group][name] = append(idx.channels[group][name], ch)
			}
		}
	}
	for _, a := range snapshot.Abilities {
		idx.addGroup(a.Group, "abilities")
		idx.abilities[topologyRelation{a.Group, a.Model, a.ChannelId}] = a
		if !slices.ContainsFunc(idx.channels[a.Group][a.Model], func(c model.TopologyChannel) bool { return c.ID == a.ChannelId }) {
			diagnostic := TopologyDiagnostic{"orphan_ability", "warning", a.ChannelId}
			idx.groups[a.Group].Diagnostics = append(idx.groups[a.Group].Diagnostics, diagnostic)
			if idx.orphan[a.Group] == nil {
				idx.orphan[a.Group] = map[string][]TopologyDiagnostic{}
			}
			idx.orphan[a.Group][a.Model] = append(idx.orphan[a.Group][a.Model], diagnostic)
		}
	}
	for group, g := range idx.groups {
		g.ConfiguredModels = len(idx.channels[group])
	}
	return idx, nil
}
func (idx *topologyIndex) addGroup(name, source string) *TopologyGroup {
	g := idx.groups[name]
	if g == nil {
		g = &TopologyGroup{Name: name, Sources: []string{}, Special: name == "auto", Diagnostics: []TopologyDiagnostic{}}
		if _, ok := idx.snapshot.Groups[name]; !ok {
			g.Diagnostics = append(g.Diagnostics, TopologyDiagnostic{"missing_group_config", "warning", 0})
		}
		if name != strings.TrimSpace(name) {
			g.Diagnostics = append(g.Diagnostics, TopologyDiagnostic{"raw_whitespace", "warning", 0})
		}
		idx.groups[name] = g
	}
	if !slices.Contains(g.Sources, source) {
		g.Sources = append(g.Sources, source)
	}
	return g
}
func (idx *topologyIndex) diagnostics(group, name string, ch model.TopologyChannel) []TopologyDiagnostic {
	result := []TopologyDiagnostic{}
	if _, ok := idx.snapshot.Groups[group]; !ok {
		result = append(result, TopologyDiagnostic{"missing_group_config", "warning", ch.ID})
	}
	if group != strings.TrimSpace(group) || name != strings.TrimSpace(name) {
		result = append(result, TopologyDiagnostic{"raw_whitespace", "warning", ch.ID})
	}
	a, ok := idx.abilities[topologyRelation{group, name, ch.ID}]
	if !ok {
		result = append(result, TopologyDiagnostic{"missing_ability", "warning", ch.ID})
	} else {
		if a.Enabled != (ch.Status == common.ChannelStatusEnabled) {
			result = append(result, TopologyDiagnostic{"ability_enabled_mismatch", "warning", ch.ID})
		}
		p := int64(0)
		if ch.Priority != nil {
			p = *ch.Priority
		}
		ap := int64(0)
		if a.Priority != nil {
			ap = *a.Priority
		}
		w := uint(0)
		if ch.Weight != nil {
			w = *ch.Weight
		}
		if p != ap || w != a.Weight {
			result = append(result, TopologyDiagnostic{"ability_routing_mismatch", "warning", ch.ID})
		}
	}
	return result
}
func (idx *topologyIndex) summary(group, name string) TopologyModelSummary {
	s := TopologyModelSummary{Name: name, ChannelIDs: []int{}, Diagnostics: []TopologyDiagnostic{}}
	priorities := map[int64]bool{}
	for _, ch := range idx.channels[group][name] {
		s.ConfiguredChannels++
		s.ChannelIDs = append(s.ChannelIDs, ch.ID)
		if ch.Status == common.ChannelStatusEnabled {
			s.EnabledChannels++
			p := int64(0)
			if ch.Priority != nil {
				p = *ch.Priority
			}
			priorities[p] = true
		}
		if ch.ModelMapping != nil && *ch.ModelMapping != "" && *ch.ModelMapping != "{}" {
			s.HasMapping = true
		}
		s.Diagnostics = append(s.Diagnostics, idx.diagnostics(group, name, ch)...)
	}
	s.Diagnostics = append(s.Diagnostics, idx.orphan[group][name]...)
	s.PriorityLayers = len(priorities)
	return s
}
func GetModelTopologyGroups() ([]TopologyGroup, error) {
	idx, err := loadTopologyIndex()
	if err != nil {
		return nil, err
	}
	names := []string{}
	for name := range idx.groups {
		names = append(names, name)
	}
	slices.Sort(names)
	groups := make([]TopologyGroup, 0, len(names))
	for _, name := range names {
		groups = append(groups, *idx.groups[name])
	}
	return groups, nil
}
func GetModelTopologyModels(q TopologyModelQuery) (*TopologyModelPage, error) {
	idx, err := loadTopologyIndex()
	if err != nil {
		return nil, err
	}
	g := idx.groups[q.Group]
	if g == nil {
		return nil, ErrTopologyNotFound
	}
	page := max(q.Page, 1)
	size := q.PageSize
	if size <= 0 {
		size = 50
	}
	size = min(size, 100)
	result := &TopologyModelPage{Items: []TopologyModelSummary{}, Page: page, PageSize: size, ObservedAt: idx.snapshot.ObservedAt, Basis: "config", RuntimeMode: idx.snapshot.RuntimeMode}
	if g.Special {
		return result, nil
	}
	result.GroupTotal = len(idx.channels[q.Group])
	names := []string{}
	for name := range idx.channels[q.Group] {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if !strings.Contains(strings.ToLower(name), strings.ToLower(q.Keyword)) {
			continue
		}
		s := idx.summary(q.Group, name)
		if (q.Status == "enabled" && s.EnabledChannels == 0) || (q.Status == "disabled" && s.EnabledChannels != 0) || (q.Status == "inconsistent" && len(s.Diagnostics) == 0) {
			continue
		}
		if q.HasMapping != nil && s.HasMapping != *q.HasMapping {
			continue
		}
		if q.HasDiagnostics != nil && (len(s.Diagnostics) > 0) != *q.HasDiagnostics {
			continue
		}
		if q.ChannelID > 0 || q.ChannelKeyword != "" {
			found := false
			for _, ch := range idx.channels[q.Group][name] {
				if (q.ChannelID == 0 || ch.ID == q.ChannelID) && strings.Contains(strings.ToLower(ch.Name), strings.ToLower(q.ChannelKeyword)) {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		result.Total++
		// Division avoids overflow for hostile, very large page parameters.
		if (result.Total-1)/size == page-1 {
			result.Items = append(result.Items, s)
		}
	}
	return result, nil
}
func GetModelTopologyDetail(group, name string) (*TopologyDetail, error) {
	idx, err := loadTopologyIndex()
	if err != nil {
		return nil, err
	}
	if idx.groups[group] == nil || group == "auto" || len(idx.channels[group][name]) == 0 {
		return nil, ErrTopologyNotFound
	}
	d := &TopologyDetail{Group: group, Model: name, ObservedAt: idx.snapshot.ObservedAt, Basis: "config", RuntimeMode: idx.snapshot.RuntimeMode, Summary: idx.summary(group, name), Tiers: []TopologyTier{}, ExcludedChannels: []TopologyChannel{}, Limitations: []string{"configuration_only", "request_context_changes_selection", "channel_mapping_only", "weight_is_not_hit_probability"}}
	tiers := map[int64][]TopologyChannel{}
	for _, ch := range idx.channels[group][name] {
		p := int64(0)
		if ch.Priority != nil {
			p = *ch.Priority
		}
		w := uint(0)
		if ch.Weight != nil {
			w = *ch.Weight
		}
		diagnostics := idx.diagnostics(group, name, ch)
		consistency := "consistent"
		if len(diagnostics) > 0 {
			consistency = "inconsistent"
		}
		c := TopologyChannel{ChannelID: ch.ID, ChannelName: ch.Name, ChannelType: ch.Type, ChannelStatus: ch.Status, ConfiguredWeight: w, Priority: p, AbilityConsistency: consistency, RelatedModelCountInGroup: len(topologyTokens(ch.Models)), Diagnostics: diagnostics, Mapping: TopologyMapping{Names: []string{name}, Status: "unchanged", Scope: "channel_mapping", Diagnostics: []TopologyDiagnostic{}}}
		if ch.ModelMapping != nil {
			c.Mapping = ResolveModelTopologyMapping(name, *ch.ModelMapping)
		}
		for i := range c.Mapping.Diagnostics {
			c.Mapping.Diagnostics[i].AffectedChannelID = ch.ID
		}
		c.Diagnostics = append(c.Diagnostics, c.Mapping.Diagnostics...)
		if ch.Status != common.ChannelStatusEnabled {
			d.ExcludedChannels = append(d.ExcludedChannels, c)
		} else {
			tiers[p] = append(tiers[p], c)
		}
	}
	priorities := []int64{}
	for p := range tiers {
		priorities = append(priorities, p)
	}
	slices.SortFunc(priorities, func(a, b int64) int {
		if a > b {
			return -1
		}
		if a < b {
			return 1
		}
		return 0
	})
	for _, p := range priorities {
		d.Tiers = append(d.Tiers, TopologyTier{p, tiers[p]})
	}
	return d, nil
}

// ResolveModelTopologyMapping mirrors ModelMappedHelper, with a bounded display
// chain. It is an observation, never a replacement for relay-time mapping.
func ResolveModelTopologyMapping(name, raw string) TopologyMapping {
	result := TopologyMapping{Names: []string{name}, Status: "unchanged", Scope: "channel_mapping", Diagnostics: []TopologyDiagnostic{}}
	if raw == "" || raw == "{}" {
		return result
	}
	mapping := map[string]string{}
	if err := common.UnmarshalJsonStr(raw, &mapping); err != nil {
		result.Status = "invalid"
		result.Diagnostics = append(result.Diagnostics, TopologyDiagnostic{"invalid_mapping", "error", 0})
		return result
	}
	current := name
	visited := map[string]bool{name: true}
	for range 64 {
		target, ok := mapping[current]
		base := hostreasoning.BaseModelName(current)
		if (!ok || target == "") && base != current {
			target, ok = mapping[base]
		}
		if !ok || target == "" || target == current {
			return result
		}
		result.Names = append(result.Names, target)
		if visited[target] {
			result.Status = "cycle"
			result.Diagnostics = append(result.Diagnostics, TopologyDiagnostic{"mapping_cycle", "error", 0})
			return result
		}
		visited[target] = true
		current = target
		result.Status = "mapped"
	}
	result.Status = "truncated"
	result.Diagnostics = append(result.Diagnostics, TopologyDiagnostic{"mapping_truncated", "warning", 0})
	return result
}
