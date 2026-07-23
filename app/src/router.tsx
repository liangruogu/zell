import { createBrowserRouter } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ProjectPage from '@/pages/ProjectPage'
import KnowledgeBasePage from '@/pages/KnowledgeBasePage'
import WhiteboardPage from '@/pages/WhiteboardPage'
import ExternalLinksPage from '@/pages/ExternalLinksPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/project/:id',
    element: <ProjectPage />,
  },
  {
    path: '/project/:id/knowledge',
    element: <KnowledgeBasePage />,
  },
  {
    path: '/project/:id/whiteboard',
    element: <ExternalLinksPage />,
  },
  {
    path: '/project/:id/links',
    element: <WhiteboardPage />,
  },
])
