'use client'

import { Banknote } from 'lucide-react'
import { ComingSoonPage } from '@/components/coming-soon-page'

export default function RentPage() {
  return (
    <ComingSoonPage
      title="Rent"
      description="Track rent payments, arrears, and collection across all your properties."
      icon={Banknote}
    />
  )
}
