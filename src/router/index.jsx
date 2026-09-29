import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import ExercisePage from '@/pages/ExercisePage'
import ExerciseBrowserPage from '@/pages/ExerciseBrowserPage'
import UnitPage from '@/pages/UnitPage'
import SettingsPage from '@/pages/SettingsPage'
import SandboxPage from '@/pages/SandboxPage'
import StudyLayout from '@/layout/StudyLayout'
import StudyPhase1Page from '@/pages/StudyPhase1Page'
import StudySessionPage from '@/pages/StudySessionPage'
import StudyReturnPage from '@/pages/StudyReturnPage'
import Phase1PreviewPage from '@/pages/Phase1PreviewPage'
import SurveyShowcasePage from '@/pages/SurveyShowcasePage'
import PivotDiagramPage from '@/pages/PivotDiagramPage'
import UserStudyLiPage from '@/pages/UserStudyLiPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to="/landing" replace />,
      },
      {
        path: 'landing',
        element: <LandingPage />,
      },
      {
        path: 'exercises',
        element: <ExerciseBrowserPage />,
      },
      {
        path: 'exercises/:unitId',
        element: <UnitPage />,
      },
      {
        path: 'exercise',
        element: <ExercisePage />,
      },
      {
        path: 'exercise/:exerciseId',
        element: <ExercisePage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'sandbox',
        element: <SandboxPage />,
      },
    ],
  },
  {
    path: '/userstudy-Li',
    element: <UserStudyLiPage />,
  },
  {
    // No header or navigation: participants cannot wander out of the task.
    path: '/study',
    element: <StudyLayout />,
    children: [
      {
        index: true,
        element: <StudySessionPage />,
      },
      {
        path: 'phase1',
        element: <StudyPhase1Page />,
      },
      {
        path: 'return',
        element: <StudyReturnPage />,
      },
      ...(import.meta.env.DEV
        ? [
            { path: 'phase1/preview', element: <Phase1PreviewPage /> },
            { path: 'showcase', element: <SurveyShowcasePage /> },
            { path: 'pivot-diagrams', element: <PivotDiagramPage /> },
          ]
        : []),
    ],
  },
])

export default router
