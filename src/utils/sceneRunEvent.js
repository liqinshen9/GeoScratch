// Dispatched on window after each scene run (runAndSync.js). A block drawer
// showing a value only a run can produce -- a point picked on an object --
// re-renders on it: the workspace change that caused the run fires before the
// run, so refreshing on that alone shows the previous run's value.
export const SCENE_RUN_EVENT = 'geoscratch:scene-run'
