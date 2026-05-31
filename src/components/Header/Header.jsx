import { useNavigate } from 'react-router-dom'
import { Home } from '@icon-park/react'
import Title from './Title'
import AutoRenderToggle from '@/components/Header/AutoRenderToggle'
import RunButton from '@/components/Header/RunButton'

export default function Header({ onRun, autoRender, onAutoRenderChange }) {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-3 gap-4 px-[var(--app-nav-gutter)] h-full w-full items-center">

      <div className="flex items-center gap-4 text-left">
        <Title />
      </div>

      <div className="flex gap-8 items-center relative" />

      <div className="flex gap-6 justify-end items-center relative">
        <AutoRenderToggle autoRender={autoRender} onAutoRenderChange={onAutoRenderChange} />
        <RunButton autoRender={autoRender} onRun={onRun} />
        <Home
          theme="outline"
          size="22"
          fill="#ffffff"
          className="cursor-pointer opacity-90 hover:opacity-100"
          onClick={() => navigate('/')}
        />
      </div>
    </div>
  )
}
