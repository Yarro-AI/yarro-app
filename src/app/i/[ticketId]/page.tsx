import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import crypto from 'crypto'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ticket Photos — Yarro',
}

function verifyImageToken(ticketId: string, token: string): boolean {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.IMAGE_URL_SECRET
  if (!secret) return false
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(`image:${ticketId}`)
  const sig = hmac.digest().subarray(0, 12)
  const expected = sig.toString('base64url')
  return expected === token
}

export default async function TicketImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { ticketId } = await params
  const { t: token } = await searchParams

  // Verify the signed token — reject unsigned or forged links
  if (!token || !verifyImageToken(ticketId, token)) {
    notFound()
  }

  // Public anon client — no cookies/auth needed
  // The SECURITY DEFINER RPC handles data access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data } = await supabase.rpc('c1_public_ticket_images', {
    p_ticket_id: ticketId,
  })

  if (!data?.images?.length) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Yarro
          </h1>
          {data.address && (
            <p className="mt-1 text-sm text-gray-500">{data.address}</p>
          )}
          {data.issue_description && (
            <p className="mt-2 text-sm text-gray-700">
              {data.issue_description}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {(data.images as string[]).map((url: string, i: number) => (
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
