import { Card, CardHeader, CardTitle, CardAction, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ProfileCardProps {
  title: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ProfileCard({ title, count, action, children, className }: ProfileCardProps) {
  return (
    <Card className={cn('py-0', className)}>
      <CardHeader className="py-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {count !== undefined && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {count}
          </span>
        )}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="pt-0 pb-2">{children}</CardContent>
    </Card>
  )
}
