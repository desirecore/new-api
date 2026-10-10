import { useInfiniteQuery,useQueries,useQuery,useQueryClient } from '@tanstack/react-query'
import { useEffect,useState } from 'react'
import { getTopologyDetail,getTopologyGroups,getTopologyModels } from '../api'
import type { TopologyDetail,TopologySearch,TopologySelection } from '../types'
export type TopologyViewInput={search:TopologySearch;onSearchChange:(next:Partial<TopologySearch>)=>void}
export type TopologyViewState=ReturnType<typeof useTopologyView>
const prefix=['model-topology'] as const
export function useTopologyView(input:TopologyViewInput){
 const client=useQueryClient()
 const groupsQuery=useQuery({queryKey:[...prefix,'groups'],queryFn:({signal})=>getTopologyGroups(signal),staleTime:30_000})
 const group=input.search.tGroup??groupsQuery.data?.find(g=>!g.special)?.name??''
 const groupInfo=groupsQuery.data?.find(g=>g.name===group)
 const [local,setLocal]=useState<{group:string;expanded:Set<string>;selection:TopologySelection|null}>({group,expanded:new Set(),selection:null})
 const active=local.group===group?local:{group,expanded:new Set<string>(),selection:null}
 const expanded=new Set(active.expanded)
 if(input.search.tModel)expanded.add(input.search.tModel)
 const selection=active.selection??(input.search.tModel?{kind:'model' as const,model:input.search.tModel}:null)
 const filters={group,keyword:input.search.tSearch,channel_keyword:input.search.tChannel,status:input.search.tStatus,has_mapping:input.search.tMapping,has_diagnostics:input.search.tDiagnostics,page_size:50}
 const modelsQuery=useInfiniteQuery({queryKey:[...prefix,'models',filters],queryFn:({pageParam,signal})=>getTopologyModels({...filters,p:pageParam},signal),initialPageParam:1,getNextPageParam:last=>last.page*last.page_size<last.total?last.page+1:undefined,enabled:group!==''&&!groupInfo?.special,staleTime:30_000})
 const pagedModels=modelsQuery.data?.pages.flatMap(page=>page.items)??[]
 const requested=[...expanded].filter(name=>pagedModels.some(m=>m.name===name)||input.search.tModel===name)
 let slots=0
 const queries=requested.map(name=>{
  const key=[...prefix,'detail',group,name]
  const state=client.getQueryState<TopologyDetail>(key)
  const pending=state?.fetchStatus==='fetching'||state?.isInvalidated||(!state?.data&&state?.status!=='error')
  const enabled=pending&&slots++<4
  return {queryKey:key,queryFn:({signal}:{signal:AbortSignal})=>getTopologyDetail(group,name,signal),enabled,staleTime:Infinity,retry:false}
 })
 const results=useQueries({queries})
 const details:Record<string,TopologyDetail>={};const detailErrors=new Set<string>();const detailLoading=new Set<string>()
 for(const [index,result] of results.entries()){
  const name=requested[index]
  if(result.data?.group===group&&result.data.model===name)details[name]=result.data
  if(result.isError)detailErrors.add(name)
  if(result.isFetching||(!result.data&&!result.isError))detailLoading.add(name)
 }
 const models=[...pagedModels]
 if(input.search.tModel&&details[input.search.tModel]&&!models.some(m=>m.name===input.search.tModel))models.unshift(details[input.search.tModel].summary)
 // Singleton groups open naturally. Multi-model pages start collapsed.
 useEffect(()=>{
  if(modelsQuery.data?.pages[0]?.total===1&&pagedModels.length===1){setLocal(prev=>prev.group===group&&prev.expanded.has(pagedModels[0].name)?prev:{group,expanded:new Set([pagedModels[0].name]),selection:prev.group===group?prev.selection:null})}
 },[group,modelsQuery.data]) // pagedModels derives entirely from this query result.
 function expandModel(name:string){setLocal({...active,expanded:new Set([...expanded,name])})}
 function collapseModel(name:string){const next=new Set(expanded);next.delete(name);setLocal({...active,expanded:next,selection:active.selection?.model===name?{kind:'model',model:name}:active.selection});if(input.search.tModel===name)input.onSearchChange({tModel:undefined})}
 function setSelection(next:TopologySelection|null){setLocal({...active,selection:next});input.onSearchChange({tModel:next?.model})}
 function collapseAll(){setLocal({...active,expanded:new Set(),selection:null});input.onSearchChange({tModel:undefined});void client.cancelQueries({queryKey:[...prefix,'detail',group]})}
 function refresh(){void client.invalidateQueries({queryKey:prefix,refetchType:'none'});void groupsQuery.refetch();void modelsQuery.refetch()}
 return {group,groupInfo,groups:groupsQuery.data??[],models,details,expandedModels:expanded,selection,mode:input.search.tMode??'tree',total:modelsQuery.data?.pages[0]?.total??0,groupTotal:modelsQuery.data?.pages[0]?.group_total??0,observedAt:modelsQuery.data?.pages[0]?.observed_at,runtimeMode:modelsQuery.data?.pages[0]?.runtime_mode,loading:groupsQuery.isPending||(group!==''&&!groupInfo?.special&&modelsQuery.isPending),refreshing:groupsQuery.isFetching||modelsQuery.isFetching,errors:groupsQuery.error??modelsQuery.error,detailErrors,detailLoading,hasMoreModels:modelsQuery.hasNextPage,loadingMore:modelsQuery.isFetchingNextPage,loadMoreModels:()=>void modelsQuery.fetchNextPage(),expandModel,collapseModel,expandAll:()=>setLocal({...active,expanded:new Set(models.map(m=>m.name))}),collapseAll,refresh,setSelection,retryDetail:(name:string)=>void client.resetQueries({queryKey:[...prefix,'detail',group,name],exact:true}),search:input.search,onSearchChange:input.onSearchChange}
}
