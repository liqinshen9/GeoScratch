import { BLOCK_CATEGORIES } from '@/components/BlocksCanvas/catalog/blockCatalog'

export default function CategoryToolbox({ selected, onSelect }) {
  return (
    <div className="category-toolbox">
      <div className="category-toolbox-list">
      {Object.values(BLOCK_CATEGORIES).map((cat) => (
        <button
          key={cat.id}
          type="button"
          className={`category-card category-card--${cat.accent}${selected === cat.id ? ' is-active' : ''}`}
          onClick={() => onSelect(cat.id)}
        >
          <strong>{cat.label}</strong>
          <span>{cat.description}</span>
        </button>
      ))}
      </div>
    </div>
  )
}
