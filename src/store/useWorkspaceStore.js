import { create } from 'zustand'

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

  setWorkspace: (ws) => set({ workspace: ws }),
  setDialogOpen: (open) => set({ dialogOpen: open }),
  setExampleXml: (xml) => set({ exampleXml: xml }),
  setTitle: (newTitle) => set({ title: newTitle }),
  clearExampleXml: () => set({ exampleXml: null }),

  // NEW: Save the XML string for a specific page ID
  saveWorkspaceXml: (id, xmlText) =>
    set((state) => ({ savedXml: { ...state.savedXml, [id]: xmlText } })),
}))

export default useWorkspaceStore
