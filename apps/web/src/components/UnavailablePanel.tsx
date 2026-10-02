import { Card } from './Card'
import { EmptyState } from './States'

/** Preserve a screen's sections while its operational API is not available. */
export function UnavailablePanel({ title, description }: { title: string; description: string }) {
  return <Card><h2 className="text-heading-s">{title}</h2><EmptyState title="Not available yet" description={description} /></Card>
}
