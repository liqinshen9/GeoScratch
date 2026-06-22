export default function Title({ text, badge }) {
  return (
    <div className="header-title-group">
      <h1 className="header-title-text">{text}</h1>
      {badge && <span className="header-title-badge">{badge}</span>}
    </div>
  )
}
