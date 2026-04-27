import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { motion } from 'framer-motion'
import GuidePopup from '../GuidePopup'

const fallbackGuides = [
  {
    label: 'Point',
    content: 'A point represents a position in 3D space, defined by (x, y, z).',
    link: 'https://mathworld.wolfram.com/Point.html',
  },
  {
    label: 'Vector',
    content: 'A vector has both direction and magnitude.',
    link: 'https://mathinsight.org/vector_introduction',
  },
]

const simpleBlockExamples = {
  line: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="geo_vector" x="24" y="24">
        <value name="pos">
          <block type="linalg_vec3">
            <field name="X">5</field>
            <field name="Y">4.5</field>
            <field name="Z">1</field>
          </block>
        </value>
        <value name="dir">
          <block type="linalg_vec3">
            <field name="X">1</field>
            <field name="Y">2</field>
            <field name="Z">-2</field>
          </block>
        </value>
      </block>
    </xml>
  `,
  points: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="geo_point" x="24" y="24">
        <value name="pos">
          <block type="linalg_vec3">
            <field name="X">1</field>
            <field name="Y">1</field>
            <field name="Z">1</field>
          </block>
        </value>
      </block>
    </xml>
  `,
  spheres: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="geo_sphere" x="24" y="24">
        <field name="R">2.4</field>
        <value name="pos">
          <block type="linalg_vec3">
            <field name="X">1</field>
            <field name="Y">-4</field>
            <field name="Z">5.6</field>
          </block>
        </value>
      </block>
    </xml>
  `,
  vector: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="vector_cross_product" x="24" y="24">
        <value name="U">
          <block type="linalg_vec3">
            <field name="X">1</field>
            <field name="Y">2</field>
            <field name="Z">3</field>
          </block>
        </value>
        <value name="V">
          <block type="linalg_vec3">
            <field name="X">3</field>
            <field name="Y">-2</field>
            <field name="Z">-1</field>
          </block>
        </value>
      </block>
    </xml>
  `,
  transform: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="object_transform" x="24" y="24">
        <!-- Target: Cube (side 2.3, centre (-2, 4, -6)) -->
        <value name="TARGET">
          <block type="geo_cube">
            <field name="SIDE">2.3</field>
            <value name="center">
              <block type="linalg_vec3">
                <field name="X">-2</field>
                <field name="Y">4</field>
                <field name="Z">-6</field>
              </block>
            </value>
          </block>
        </value>
        <!-- Rotate: 90° about Z -->
        <value name="rot">
          <block type="rot_matrix">
            <field name="r1c1">0</field>
            <field name="r1c2">-1</field>
            <field name="r1c3">0</field>
            <field name="r2c1">1</field>
            <field name="r2c2">0</field>
            <field name="r2c3">0</field>
            <field name="r3c1">0</field>
            <field name="r3c2">0</field>
            <field name="r3c3">1</field>
          </block>
        </value>
        <!-- Scaling: diag(-4, 0.5, 3) -->
        <value name="scale">
          <block type="scale_matrix">
            <field name="r1c1">-4</field>
            <field name="r2c2">0.5</field>
            <field name="r3c3">3</field>
          </block>
        </value>
      </block>
    </xml>
  `,
  plane: `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="parametric_plane" x="24" y="24">
        <value name="point">
          <block type="linalg_vec3">
            <field name="X">-1</field>
            <field name="Y">3</field>
            <field name="Z">4</field>
          </block>
        </value>
        <value name="norm">
          <block type="linalg_vec3">
            <field name="X">1</field>
            <field name="Y">-1</field>
            <field name="Z">3</field>
          </block>
        </value>
      </block>
    </xml>
  `,
}

export default function ExamplesAndGuidesMenu({ onLoadExample }) {
  const [showMenu, setShowMenu] = useState(false)
  const [guides, setGuides] = useState(fallbackGuides)
  const [selectedGuide, setSelectedGuide] = useState(null)
  const [isBlinking, setIsBlinking] = useState(true)

  // Load external guides.json if available
  useEffect(() => {
    fetch('/math-guides.json')
      .then((res) => res.json())
      .then((data) => setGuides(data))
      .catch(() => {
        console.warn('Using fallback guides')
      })
  }, [])

  // Auto-stop blinking after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => setIsBlinking(false), 10000)
    return () => clearTimeout(timer)
  }, [])

  const handleShowSimpleExample = (exampleType) => {
    const xml = simpleBlockExamples[exampleType]
    if (xml) {
      onLoadExample?.(xml)
    }
    setShowMenu(false)
  }

  const handlePickGuide = (guide) => {
    setSelectedGuide(guide)
    setShowMenu(false)
  }

  return (
    <>
      <GuidePopup guide={selectedGuide} onClose={() => setSelectedGuide(null)} />

      <div className="relative" style={{ marginTop: '10px' }}>
        <motion.div
          animate={isBlinking ? { y: [0, -15, 0] } : {}}
          transition={{
            duration: 0.8,
            repeat: isBlinking ? Infinity : 0,
            ease: 'easeInOut',
          }}
          onClick={() => {
            setShowMenu((open) => !open)
            setSelectedGuide(null)
            setIsBlinking(false)
          }}
          style={{ cursor: 'pointer' }}
        >
          <FontAwesomeIcon
            icon="fa-solid fa-lightbulb"
            className="text-3xl hover:scale-110"
            style={{
              color: '#fbbf24',
              filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))',
            }}
          />
        </motion.div>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-72 rounded bg-white text-slate-900 shadow-lg z-10">
            {/* Simple Examples */}
            <div className="border-b px-3 py-2 font-semibold text-sm">Simple Examples</div>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('line')}>
              🔵 Line Example
            </button>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('points')}>
              🔴 Points Example
            </button>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('spheres')}>
              🟢 Spheres Example
            </button>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('plane')}>
              🟦 Plane Example
            </button>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('vector')}>
              ➔ Vector Operations Example
            </button>
            <button className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100" onClick={() => handleShowSimpleExample('transform')}>
              🟪 Object Linear Transform Example
            </button>

            {/* Guides */}
            <div className="border-t border-b px-3 py-2 font-semibold text-sm">Math Guides</div>
            {guides.map((g) => (
              <button
                key={g.label}
                className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => handlePickGuide(g)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
