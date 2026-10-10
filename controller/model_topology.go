package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

func topologyResponse(c *gin.Context, data any, err error) {
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrTopologyNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"success": false, "message": "Unable to load model topology"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}
func GetModelTopologyGroups(c *gin.Context) {
	data, err := service.GetModelTopologyGroups()
	topologyResponse(c, data, err)
}
func GetModelTopologyDetail(c *gin.Context) {
	group, name := c.Query("group"), c.Query("model")
	if group == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "group and model are required"})
		return
	}
	data, err := service.GetModelTopologyDetail(group, name)
	topologyResponse(c, data, err)
}
func GetModelTopologyModels(c *gin.Context) {
	q := service.TopologyModelQuery{Group: c.Query("group"), Keyword: c.Query("keyword"), ChannelKeyword: c.Query("channel_keyword"), Status: c.DefaultQuery("status", "all"), Page: 1, PageSize: 50}
	invalid := q.Group == "" || (q.Status != "all" && q.Status != "enabled" && q.Status != "disabled" && q.Status != "inconsistent")
	for _, field := range []struct {
		key   string
		value *int
	}{{"p", &q.Page}, {"page_size", &q.PageSize}, {"channel_id", &q.ChannelID}} {
		if raw, ok := c.GetQuery(field.key); ok {
			value, err := strconv.Atoi(raw)
			if err != nil || value < 1 {
				invalid = true
			}
			*field.value = value
		}
	}
	for _, field := range []struct {
		key   string
		value **bool
	}{{"has_mapping", &q.HasMapping}, {"has_diagnostics", &q.HasDiagnostics}} {
		if raw, ok := c.GetQuery(field.key); ok {
			value, err := strconv.ParseBool(raw)
			if err != nil {
				invalid = true
			}
			*field.value = &value
		}
	}
	if invalid {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid topology query"})
		return
	}
	data, err := service.GetModelTopologyModels(q)
	topologyResponse(c, data, err)
}
