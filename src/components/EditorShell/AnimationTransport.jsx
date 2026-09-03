import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import useAnimationStore from '@/store/useAnimationStore'
import useSettingsStore from '@/store/useSettingsStore'
import { ANIMATION_SPEED_PRESETS } from '@/store/animationConfig'
import './animation-transport.css'

// Sits in the "3D View" column header. Drives useAnimationStore (transient
// transport state); AnimationDriver (inside the Canvas) does the actual
// per-frame pose interpolation of the selected object's transform pipeline.
// `hasTarget` is set by the driver based on whether the current selection
// resolves to something animatable. Speed writes the same setting the Settings
// page's "Animation & Highlighting" card edits.

export default function AnimationTransport() {
  const playing = useAnimationStore((s) => s.playing)
  const progress = useAnimationStore((s) => s.progress)
  const hasTarget = useAnimationStore((s) => s.hasTarget)
  const toggle = useAnimationStore((s) => s.toggle)
  const stop = useAnimationStore((s) => s.stop)
  const setProgress = useAnimationStore((s) => s.setProgress)

  const durationMs = useSettingsStore((s) => s.settings.animationDurationMs)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  return (
    <div className="animation-transport" data-disabled={!hasTarget}>
      <button
        type="button"
        className="animation-transport__btn"
        onClick={toggle}
        disabled={!hasTarget}
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause animation' : 'Play animation'}
      >
        <FontAwesomeIcon icon={playing ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
      </button>
      <button
        type="button"
        className="animation-transport__btn"
        onClick={stop}
        disabled={!hasTarget || (progress >= 1 && !playing)}
        title="Reset to end"
        aria-label="Reset animation"
      >
        <FontAwesomeIcon icon="fa-solid fa-stop" />
      </button>

      <input
        type="range"
        className="animation-transport__scrub"
        min={0}
        max={1}
        step={0.01}
        value={progress}
        disabled={!hasTarget}
        onChange={(e) => setProgress(Number(e.target.value))}
        aria-label="Animation progress"
      />

      <select
        className="animation-transport__speed"
        value={durationMs}
        disabled={!hasTarget}
        onChange={(e) => updateSetting('animationDurationMs', Number(e.target.value))}
        aria-label="Animation speed"
        title="Animation speed"
      >
        {ANIMATION_SPEED_PRESETS.map((opt) => (
          <option key={opt.label} value={opt.ms}>
            {opt.label}
          </option>
        ))}
      </select>

      {!hasTarget && (
        <span className="animation-transport__hint">Select a transform pipeline or a vector operation to animate</span>
      )}
    </div>
  )
}
