import Title from './Title'
import AutoRenderToggle from '@/components/Header/AutoRenderToggle'
import RunButton from '@/components/Header/RunButton'
import WorkspaceFileControls from '@/components/Header/WorkspaceFileControls'
import ExamplesAndGuidesMenu from '@/components/Header/ExamplesAndGuidesMenu'

export default function Header({ onRun, onLoadExample, autoRender, onAutoRenderChange }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 h-full items-center">

      {/* Title */}
      <div className="text-left">
        <Title />
      </div>

      <div className="flex gap-8 items-center relative" />

      {/* Right controls */}
      <div className="flex gap-6 justify-end items-center relative">
        <AutoRenderToggle autoRender={autoRender} onAutoRenderChange={onAutoRenderChange} />
        <ExamplesAndGuidesMenu onLoadExample={onLoadExample} />
        <RunButton autoRender={autoRender} onRun={onRun} />
        <WorkspaceFileControls />
      </div>
    </div>
  )
}
