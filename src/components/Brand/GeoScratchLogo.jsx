import logoMark from '@/assets/brand/geoscratch-logo.png'
import logoMarkCompact from '@/assets/brand/geoscratch-logo-mark.png'
import './GeoScratchLogo.css'

export default function GeoScratchLogo({
  size,
  className = '',
  wordmark = 'GeoScratch',
  showMark = true,
  showWordmark = false,
  compact = false,
}) {
  const markSize = typeof size === 'number' && Number.isFinite(size) ? `${size}px` : null

  return (
    <span
      className={`geoscratch-logo ${className}`.trim()}
      style={markSize ? { '--geoscratch-logo-size': markSize } : undefined}
    >
      {showMark && (
        <img
          className="geoscratch-logo__mark"
          src={compact ? logoMarkCompact : logoMark}
          alt=""
          aria-hidden={showWordmark ? undefined : true}
        />
      )}
      {!showWordmark && <span className="sr-only">GeoScratch</span>}
      {showWordmark && <span className="geoscratch-logo__wordmark">{wordmark}</span>}
    </span>
  )
}
