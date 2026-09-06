import useSceneStore from '@/store/useSceneStore'
import { Switch } from '@/components/ui/switch' // replace with your actual UI primitive

export default function AutoRenderToggle() {
  const { autoRender, setAutoRender } = useSceneStore()
  return (
    <div className="flex items-center gap-2 px-2 text-sm font-medium">
      <label htmlFor="auto-render-switch" className="cursor-pointer select-none">
        Auto Render
      </label>
      <Switch id="auto-render-switch" checked={autoRender} onCheckedChange={setAutoRender} />
    </div>
  )
}
