// Shared formatting utilities for portal pages
// These are used across tenant, contractor, landlord, and OOH portals.

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

export function formatScheduledSlot(iso: string): { date: string; slot: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const hour = d.getHours()
  if (hour < 12) return { date, slot: 'Morning (09:00\u201312:00)' }
  if (hour < 17) return { date, slot: 'Afternoon (12:00\u201317:00)' }
  return { date, slot: 'Evening (17:00\u201320:00)' }
}
