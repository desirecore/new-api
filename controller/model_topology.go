package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func GetModelTopologyDetail(c *gin.Context) {
	group, name := c.Query("group"), c.Query("model")
	if group == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "group and model are required"})
		return
	}
	result, err := service.GetModelTopologyDetail(group, name)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrTopologyNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"success": false, "message": "Unable to load model topology"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
