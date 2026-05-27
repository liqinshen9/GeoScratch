import { Link } from 'react-router-dom'
import Title from './Title'
import AutoRenderToggle from '@/components/Header/AutoRenderToggle'
import RunButton from '@/components/Header/RunButton'
import WorkspaceFileControls from '@/components/Header/WorkspaceFileControls'

export default function Header({ onRun, autoRender, onAutoRenderChange }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 h-full items-center">

      <div className="flex items-center gap-4 text-left">
        <Link to="/" className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline">
          Home
        </Link>
        <Title />
      </div>

      <div className="flex gap-8 items-center relative" />

      <div className="flex gap-6 justify-end items-center relative">
        <AutoRenderToggle autoRender={autoRender} onAutoRenderChange={onAutoRenderChange} />
        <RunButton autoRender={autoRender} onRun={onRun} />
        <WorkspaceFileControls />
      </div>
    </div>
  )
}
