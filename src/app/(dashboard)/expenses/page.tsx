'use client'

import { ClipboardList } from 'lucide-react'
import { ComingSoonPage } from '@/components/coming-soon-page'

export default function ExpensesPage() {
  return (
    <ComingSoonPage
      title="Expense Tracker"
      description="Log expenses, store receipts, and connect to spreadsheets for reporting."
      icon={ClipboardList}
    />
  )
}
