import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import ExercisePage from '@/pages/ExercisePage'
import SettingsPage from '@/pages/SettingsPage'
import SandboxPage from '@/pages/SandboxPage' // Cleaned up name from App

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />, // Master wrapper containing the header
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
        path: 'exercise',
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
