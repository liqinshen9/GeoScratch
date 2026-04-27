import { useState, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { motion } from 'framer-motion'
import { loadWorkspace, saveWorkspace } from '../../utils/serialization'
import GuidePopup from '../GuidePopup' 
import useWorkspaceStore from '../../store/useWorkspaceStore'
import Title from '@/components/Title'
import * as Blockly from 'blockly/core'

// Default guides (used if JSON not found)
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

export default function Header({ onRun, onLoadExample, autoRender, onAutoRenderChange }) {
  const [showMenu, setShowMenu] = useState(false)
  const [guides, setGuides] = useState(fallbackGuides)
  const [selectedGuide, setSelectedGuide] = useState(null)
  const [currentChapter, setCurrentChapter] = useState("Chapter 1 - Basic Geometry")
  const [learningProgress, setLearningProgress] = useState(25)
  const [isBlinking, setIsBlinking] = useState(true)
  const popupRef = useRef(null)

  //grab workspace from zustand store for use with save/load calls
  const ws = useWorkspaceStore((state) => state.workspace)

  // Load external guides.json if available
  useEffect(() => {
    fetch('/math-guides.json')
      .then((res) => res.json())
      .then((data) => setGuides(data))
      .catch(() => {
        console.warn('Using fallback guides')
      })
  }, [])

  // Auto-stop blinking after 10 seconds when user visits the page
  useEffect(() => {
    console.log('Jumping started:', isBlinking) // Debug log
    const timer = setTimeout(() => {
      console.log('Stopping jump after 10 seconds') // Debug log
      setIsBlinking(false)
    }, 10000) // Stop jumping after 10 seconds

    return () => clearTimeout(timer)
  }, [])

  // Close popup when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setSelectedGuide(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // const handlePickExample = (xml) => {
  //   onLoadExample?.(xml)
  //   setShowMenu(false)
  // }

  const handleShowSimpleExample = (exampleType) => {
    console.log('Clicked example:', exampleType)
    console.log('onLoadExample function:', onLoadExample)
    // Simple Blockly XML examples
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
      vector:`
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
        
            <!-- (Translate left empty in this example)
            <value name="trans">
              <block type="trans_matrix">...</block>
            </value>
            -->
        
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
      `
    }

    const xml = simpleBlockExamples[exampleType]
    console.log('XML content:', xml)
    if (xml) {
      // Load Blockly XML to workspace
      console.log('About to call onLoadExample')
      onLoadExample?.(xml)
      console.log('Called onLoadExample')
    } else {
      console.log('No corresponding XML found')
    }
    setShowMenu(false)
  }

  const handlePickGuide = (guide) => {
    setSelectedGuide(guide)
    setShowMenu(false)
  }


  return (
    <div className="grid grid-cols-3 gap-4 px-4 h-full items-center">
      
      {/* Title */}
      <div className="text-left">
        <Title />
      </div>

      {/* Left controls */}
      <div className="flex gap-8 items-center relative">
        {/* Main Menu */}

        {/* Navigation */}
        {/* <FontAwesomeIcon 
          icon="fa-solid fa-angle-left" 
          className="text-2xl cursor-pointer hover:text-sky-700" 
          title="Previous Lesson"
        />
        <FontAwesomeIcon 
          icon="fa-solid fa-angle-right" 
          className="text-2xl cursor-pointer hover:text-sky-700" 
          title="Next Lesson"
        /> */}
        
      </div>

      {/* Right controls */}
      <div className="flex gap-6 justify-end items-center relative">
      
      <GuidePopup guide={selectedGuide} onClose={() => setSelectedGuide(null)} />
        {/* Auto Render toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRender}
            onChange={(e) => onAutoRenderChange?.(e.target.checked)}
            className="cursor-pointer"
          />
          Auto Render
        </label>

        {/* Lightbulb Menu */}
        <div className="relative" style={{ marginTop: '10px' }}>
          <motion.div
            animate={isBlinking ? {
              y: [0, -15, 0],
            } : {}}
            transition={{
              duration: 0.8,
              repeat: isBlinking ? Infinity : 0,
              ease: "easeInOut",
            }}
            onClick={() => {
              setShowMenu((open) => !open)
              setSelectedGuide(null) // reset guide when reopening menu
              setIsBlinking(false) // Stop jumping when user clicks
            }}
            style={{ cursor: 'pointer' }}
          >
            <FontAwesomeIcon
              icon="fa-solid fa-lightbulb"
              className="text-3xl hover:scale-110"
              style={{
                color: '#fbbf24',
                filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))'
              }}
            />
          </motion.div>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded bg-white text-slate-900 shadow-lg z-10">
              {/* Simple Examples */}
              <div className="border-b px-3 py-2 font-semibold text-sm">Simple Examples</div>
              <button
                className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => handleShowSimpleExample('line')}
              >
                🔵 Line Example
              </button>
              <button
                className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => handleShowSimpleExample('points')}
              >
                🔴 Points Example
              </button>
              <button
                className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => handleShowSimpleExample('spheres')}
              >
                🟢 Spheres Example
              </button>
                <button
                  className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => handleShowSimpleExample('plane')}
                >
                🟦 Plane Example
                </button>
                <button
                  className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => handleShowSimpleExample('vector')}
                >
                  ➔ Vector Operations Example
                </button>
                <button
                  className="flex w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => handleShowSimpleExample('transform')}
                >
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

        {/* Run Button */}
        <FontAwesomeIcon
          icon="fa-solid fa-play"
          className={`text-2xl transition-opacity ${autoRender ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:text-sky-700'}`}
          onClick={() => !autoRender && onRun?.()}
          title={autoRender ? 'Disable Auto Render to run manually' : 'Run'}
        />

        
        <FontAwesomeIcon icon="fa-solid fa-file-import" className="text-2xl cursor-pointer hover:text-sky-700" onClick={() => loadWorkspace(ws)} title="Import code"/>
        <FontAwesomeIcon icon="fa-solid fa-file-export" className="text-2xl cursor-pointer hover:text-sky-700" onClick={() => saveWorkspace(ws)} title="Export code"/>
      </div>
    </div>
  )
}
