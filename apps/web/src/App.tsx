import { AuthProvider } from './features/auth/auth'
import { AppRoutes } from './app/routes'

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
