import useAuthStore from '@/store/useAuthStore'

// The study's dev controls (skip questionnaire, skip task, trial navigation,
// feedback on every trial, fill solution) show in a dev build and for the
// `test` cohort, so a deployed test link can be walked through quickly.
// See docs/architecture/study-session.md#dev-tools.
export const TEST_COHORT = 'test'

export function studyDevToolsEnabled({ dev, cohort }) {
  return Boolean(dev) || cohort === TEST_COHORT
}

export function useStudyDevTools() {
  const cohort = useAuthStore((s) => s.cohort)
  return studyDevToolsEnabled({ dev: import.meta.env.DEV, cohort })
}
