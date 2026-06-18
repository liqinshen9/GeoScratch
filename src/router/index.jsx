import { createBrowserRouter } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import ExercisePage from '@/pages/ExercisePage'
import SettingsPage from '@/pages/SettingsPage'
import App from '../App'

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/exercise',
    element: <ExercisePage />,
  },
  {
    path: '/settings',
    element: <SettingsPage />,
  },
  {
    path: '/sandbox',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <App />,
      },
    ],
  },
])

export default router
