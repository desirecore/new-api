package controller

import (
	"fmt"
	"net/http"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelTopologyDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env)
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			old := ratio_setting.GroupRatio2JSONString()
			t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(old)) })
			require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"empty":1,"premium":1,"other":1,"auto":1}`))
			mapping := `{"org/model":"alias","alias":"vendor"}`
			weight := uint(0)
			priority := int64(100)
			require.NoError(t, db.Create(&[]model.Channel{
				{Name: "Private channel", Key: "top-secret", BaseURL: ptrTopology("https://private.example"), Group: "premium,undeclared", Models: "org/model,100%,hidden", Status: 1, Priority: &priority, Weight: &weight, ModelMapping: &mapping},
				{Name: "disabled", Key: "secret-two", Group: "premium", Models: "org/model,disabled-only", Status: 2},
				{Name: "other", Key: "secret-three", Group: "other", Models: "org/model", Status: 1},
				{Name: "space", Group: " premium", Models: " raw ", Status: 1},
			}).Error)
			require.NoError(t, db.Create(&[]model.Ability{{Group: "premium", Model: "org/model", ChannelId: 1, Enabled: false}, {Group: "orphan", Model: "ghost", ChannelId: 999, Enabled: true}}).Error)
			groups, err := service.GetModelTopologyGroups()
			require.NoError(t, err)
			names := []string{}
			for _, g := range groups {
				names = append(names, g.Name)
			}
			assert.Contains(t, names, "empty")
			assert.Contains(t, names, "undeclared")
			assert.Contains(t, names, "orphan")
			assert.Contains(t, names, " premium")
			empty, err := service.GetModelTopologyModels(service.TopologyModelQuery{Group: "empty"})
			require.NoError(t, err)
			assert.Empty(t, empty.Items)
			page, err := service.GetModelTopologyModels(service.TopologyModelQuery{Group: "premium", PageSize: 1000})
			require.NoError(t, err)
			assert.Equal(t, 100, page.PageSize)
			assert.Equal(t, 4, page.Total)
			assert.Equal(t, []string{"100%", "disabled-only", "hidden", "org/model"}, []string{page.Items[0].Name, page.Items[1].Name, page.Items[2].Name, page.Items[3].Name})
			assert.Equal(t, 2, page.Items[3].ConfiguredChannels)
			assert.Equal(t, 1, page.Items[3].EnabledChannels)
			assert.NotEmpty(t, page.Items[3].Diagnostics)
			found, err := service.GetModelTopologyModels(service.TopologyModelQuery{Group: "premium", Keyword: "%"})
			require.NoError(t, err)
			assert.Equal(t, 1, found.Total)
			detail, err := service.GetModelTopologyDetail("premium", "org/model")
			require.NoError(t, err)
			assert.Len(t, detail.Tiers, 1)
			assert.Len(t, detail.ExcludedChannels, 1)
			assert.Equal(t, 1, detail.Tiers[0].Channels[0].ChannelID)
			other, err := service.GetModelTopologyDetail("other", "org/model")
			require.NoError(t, err)
			assert.Equal(t, 3, other.Tiers[0].Channels[0].ChannelID)
			_, err = service.GetModelTopologyDetail("premium", "ghost")
			assert.ErrorIs(t, err, service.ErrTopologyNotFound)
			orphan, err := service.GetModelTopologyModels(service.TopologyModelQuery{Group: "orphan"})
			require.NoError(t, err)
			assert.Empty(t, orphan.Items)
			var response struct {
				Success bool
				Data    service.TopologyDetail
			}
			r := modelManagementRequest(t, GetModelTopologyDetail, http.MethodGet, "/api/model-topology/detail?group=premium&model=org%2Fmodel", nil, &response)
			assert.Equal(t, 200, r.Code)
			assert.True(t, response.Success)
			for _, secret := range []string{"top-secret", "secret-two", "private.example", "base_url", "model_mapping", "key"} {
				assert.NotContains(t, r.Body.String(), secret)
			}
			for _, query := range []string{"", "?group=premium&model=missing"} {
				r = modelManagementRequest(t, GetModelTopologyDetail, http.MethodGet, "/api/model-topology/detail"+query, nil, nil)
				assert.NotEqual(t, 200, r.Code)
			}
			models := make([]model.Channel, 105)
			for i := range models {
				models[i] = model.Channel{Name: fmt.Sprint(i), Group: "large", Models: fmt.Sprintf("m%03d", i), Status: 1}
			}
			require.NoError(t, db.Create(&models).Error)
			large, err := service.GetModelTopologyModels(service.TopologyModelQuery{Group: "large", Page: 2, PageSize: 100})
			require.NoError(t, err)
			assert.Equal(t, 105, large.Total)
			assert.Len(t, large.Items, 5)
			var count int64
			require.NoError(t, db.Model(&model.Ability{}).Count(&count).Error)
			assert.EqualValues(t, 2, count)
			assert.False(t, common.MemoryCacheEnabled)
		})
	}
}
func ptrTopology(s string) *string { return &s }
