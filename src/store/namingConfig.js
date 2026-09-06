// Settings-facing enums for the unified naming system (namingRegistry.js
// holds the operational NAMEABLE_KIND_CONFIG; these two are just what the
// Settings page and useSettingsStore need).

export const NAMING_STYLES = Object.freeze({
  SHORT: 'short',
  DESCRIPTIVE: 'descriptive',
})

export const LABEL_DETAIL_LEVELS = Object.freeze({
  NAME_ONLY: 'nameOnly',
  NAME_AND_VALUE: 'nameAndValue',
})
