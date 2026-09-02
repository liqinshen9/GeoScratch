import { create } from 'zustand'

const USER_BLOCKS_STORAGE_KEY = 'geoscratch:userBlocks'

function loadUserBlocks() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_BLOCKS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[GeoScratch] Failed to load user blocks:', err)
    return []
  }
}

function persistUserBlocks(userBlocks) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(USER_BLOCKS_STORAGE_KEY, JSON.stringify(userBlocks))
  } catch (err) {
    console.error('[GeoScratch] Failed to save user blocks:', err)
  }
}

const useWorkspaceStore = create((set) => ({
  // Blockly workspace instance (current active one)
  workspace: null,
  // Create Object Dialog Status
  dialogOpen: false,
  // Example XML
  exampleXml: null,
  // Title Status
  title: 'GeoScratch',

  // NEW: Memory bank for serialized workspace data
  savedXml: {},
  userBlocks: loadUserBlocks(),

  // Block id shared between the Blockly workspace and the 3D scene: selecting
  // a block or its 3D object drives the other side's highlight. null = nothing
  // selected. The identity short-circuit below is the primary guard against a
  // block.select() <-> SELECTED-event feedback loop.
  selectedBlockId: null,
  setSelectedBlockId: (id) =>
    set((state) => (state.selectedBlockId === id ? state : { selectedBlockId: id })),

  setWorkspace: (ws) => set({ workspace: ws }),
  setDialogOpen: (open) => set({ dialogOpen: open }),
  setExampleXml: (xml) => set({ exampleXml: xml }),
  setTitle: (newTitle) => set({ title: newTitle }),
  clearExampleXml: () => set({ exampleXml: null }),

  // NEW: Save the XML string for a specific page ID
  saveWorkspaceXml: (id, xmlText) =>
    set((state) => ({ savedXml: { ...state.savedXml, [id]: xmlText } })),
  addUserBlock: ({ name, xmlText, source = 'workspace' }) => {
    const trimmedName = String(name || '').trim()
    if (!trimmedName || !xmlText) return null

    const block = {
      id: `my-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      xmlText,
      source,
      createdAt: new Date().toISOString(),
    }

    set((state) => {
      const userBlocks = [block, ...state.userBlocks]
      persistUserBlocks(userBlocks)
      return { userBlocks }
    })

    return block
  },
  deleteUserBlock: (blockId) =>
    set((state) => {
      const userBlocks = state.userBlocks.filter((block) => block.id !== blockId)
      persistUserBlocks(userBlocks)
      return { userBlocks }
    }),
}))

export default useWorkspaceStore
