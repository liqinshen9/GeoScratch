import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import ExercisePage from '@/pages/ExercisePage'
import ExerciseBrowserPage from '@/pages/ExerciseBrowserPage'
import SettingsPage from '@/pages/SettingsPage'
import SandboxPage from '@/pages/SandboxPage'

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
        path: 'exercise',
        element: <ExercisePage />,
      },
      {
        path: 'exercise/:exerciseNumber',
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
])

export default router
