package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"net/http"
)

var modelTopologyPermissionRoutes = []permissionRoute{
	{http.MethodGet, "/groups", authz.ChannelRead, controller.GetModelTopologyGroups},
	{http.MethodGet, "/models", authz.ChannelRead, controller.GetModelTopologyModels},
	{http.MethodGet, "/detail", authz.ChannelRead, controller.GetModelTopologyDetail},
}

func setModelTopologyRoutes(api *gin.RouterGroup) {
	group := api.Group("/model-topology", middleware.AdminAuth())
	for _, route := range modelTopologyPermissionRoutes {
		handlePermissionRoute(group, route.method, route.path, route.permission, route.handler)
	}
}
