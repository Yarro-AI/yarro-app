import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ticket Photos — Yarro',
}

export default async function TicketImagesPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  const supabase = await createClient()

  const { data: ticket } = await supabase
    .from('c1_tickets')
    .select('id, images, issue_description, category, c1_properties(address)')
    .eq('id', ticketId)
    .single()

  if (!ticket?.images?.length) {
    notFound()
  }

  const address = (ticket.c1_properties as { address?: string } | null)?.address

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Yarro
          </h1>
          {address && (
            <p className="mt-1 text-sm text-gray-500">{address}</p>
          )}
          {ticket.issue_description && (
            <p className="mt-2 text-sm text-gray-700">
              {ticket.issue_description}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {(ticket.images as string[]).map((url, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg bg-white shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-auto w-full"
              />
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-gray-400">
          Powered by Yarro
        </p>
      </div>
    </div>
  )
}
