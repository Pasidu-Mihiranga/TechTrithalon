import { useOutletContext } from 'react-router-dom'

/** Workspace filters supplied by the authenticated shell; standalone screens use API defaults. */
export function useDispatcherScope() {
  return useOutletContext<{ depot?: string } | null>() ?? {}
}
