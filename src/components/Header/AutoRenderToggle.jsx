export default function AutoRenderToggle({ autoRender, onAutoRenderChange }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={autoRender}
        onChange={(e) => onAutoRenderChange?.(e.target.checked)}
        className="cursor-pointer"
      />
      Auto Render
    </label>
  )
}
