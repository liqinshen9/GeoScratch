// Injected by vite.config.js `define`. The typeof guard keeps a plain Node
// import (and lint) working without the build-time replacement.
/* global __BUILD_COMMIT__ */
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown'
