import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import type { TopologyDetail,TopologyGroup,TopologyModelPage,TopologyModelQuery } from './types'
export async function getTopologyGroups(signal?:AbortSignal):Promise<TopologyGroup[]> {
 const {data}=await api.get<{success:boolean;message?:string;data:TopologyGroup[]}>('/api/model-topology/groups',{signal})
 return requireServerSuccess(data).data
}
export async function getTopologyModels(query:TopologyModelQuery,signal?:AbortSignal):Promise<TopologyModelPage> {
 const {data}=await api.get<{success:boolean;message?:string;data:TopologyModelPage}>('/api/model-topology/models',{params:query,signal})
 return requireServerSuccess(data).data
}
export async function getTopologyDetail(group:string,model:string,signal?:AbortSignal):Promise<TopologyDetail> {
 const {data}=await api.get<{success:boolean;message?:string;data:TopologyDetail}>('/api/model-topology/detail',{params:{group,model},signal})
 return requireServerSuccess(data).data
}
