package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"time"
)

// TopologyChannel intentionally excludes credentials and provider settings.
// Raw configuration values are retained, including malformed whitespace.
type TopologyChannel struct {
	ID           int `gorm:"column:id"`
	Name         string
	Type         int
	Status       int
	Models       string
	Group        string
	Priority     *int64
	Weight       *uint
	ModelMapping *string
}
type ModelTopologySnapshot struct {
	Channels    []TopologyChannel
	Abilities   []Ability
	Groups      map[string]float64
	ObservedAt  string
	RuntimeMode string
}

func LoadModelTopologySnapshot() (*ModelTopologySnapshot, error) {
	snapshot := &ModelTopologySnapshot{Groups: ratio_setting.GetGroupRatioCopy(), ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), RuntimeMode: "database"}
	if common.MemoryCacheEnabled {
		snapshot.RuntimeMode = "memory_cache"
	}
	if err := DB.Model(&Channel{}).Select("id", "name", "type", "status", "models", "group", "priority", "weight", "model_mapping").Order("id").Find(&snapshot.Channels).Error; err != nil {
		return nil, err
	}
	if err := DB.Select("group", "model", "channel_id", "enabled", "priority", "weight").Find(&snapshot.Abilities).Error; err != nil {
		return nil, err
	}
	return snapshot, nil
}
