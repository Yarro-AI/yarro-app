'use client'

import { FileText } from 'lucide-react'
import { ComingSoonPage } from '@/components/coming-soon-page'

export default function InvoicesPage() {
  return (
    <ComingSoonPage
      title="Invoices"
      description="Upload, sort, and track invoices from contractors and suppliers."
      icon={FileText}
    />
  )
}
