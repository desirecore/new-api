import type { TopologyGraph,TopologyMode } from '../types'
export function layoutTopologyGraph(graph:TopologyGraph,mode:TopologyMode,previousPositions?:ReadonlyMap<string,{x:number;y:number}>):TopologyGraph {
 const positions=new Map<string,{x:number;y:number}>()
 if(mode==='network'){
  for(const depth of [0,1,2]){
   const layer=graph.nodes.filter(n=>n.data.depth===depth)
   layer.sort((a,b)=>a.id.localeCompare(b.id))
   for(const [row,node] of layer.entries())positions.set(node.id,{x:depth*340,y:row*160})
  }
 }else{
  let cursor=0
  for(const model of graph.nodes.filter(n=>n.data.kind==='model')){
   const owned=graph.nodes.filter(n=>n.data.model===model.data.model)
   const depths=new Map<number,typeof owned>()
   for(const node of owned){const layer=depths.get(node.data.depth)??[];layer.push(node);depths.set(node.data.depth,layer)}
   const height=Math.max(1,...[...depths.values()].map(layer=>layer.length))*160
   const start=Math.max(cursor,previousPositions?.get(model.id)?.y??0)
   for(const [depth,layer] of depths){for(const [row,node] of layer.entries())positions.set(node.id,{x:depth*340,y:start+row*160})}
   cursor=start+height+60
  }
 }
 return {...graph,nodes:graph.nodes.map(n=>({...n,position:positions.get(n.id)??{x:0,y:0}}))}
}
