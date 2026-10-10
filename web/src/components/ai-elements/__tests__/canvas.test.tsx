import { render,screen,cleanup } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { afterEach,expect,it } from 'vitest'
import { Canvas } from '../canvas'

afterEach(cleanup)
it('preserves the default interactive controls and allows a read-only consumer to hide them',()=>{
 const first=render(<ReactFlowProvider><Canvas/></ReactFlowProvider>)
 expect(screen.getByRole('button',{name:'Toggle Interactivity'})).toBeInTheDocument()
 first.unmount()
 render(<ReactFlowProvider><Canvas controlsProps={{showInteractive:false}}/></ReactFlowProvider>)
 expect(screen.queryByRole('button',{name:'Toggle Interactivity'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Zoom In'})).toBeInTheDocument()
})
