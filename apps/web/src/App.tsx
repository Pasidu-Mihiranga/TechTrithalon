import { useEffect } from 'react'
import { AuthProvider } from './features/auth/auth'
import { AppRoutes } from './app/routes'
import { useDeviceClass } from './lib/device'

export default function App() {
  const device = useDeviceClass()
  // Layouts key on this attribute (see shell.css), so a tablet or phone gets its own design.
  useEffect(() => { document.documentElement.dataset.device = device }, [device])
  return <AuthProvider><AppRoutes /></AuthProvider>
}
