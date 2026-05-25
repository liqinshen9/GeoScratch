import { createBrowserRouter } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import App from '../App'

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
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
