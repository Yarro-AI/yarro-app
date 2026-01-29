import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const cookieStore = await cookies()

    // CRITICAL: Clear ALL existing auth cookies FIRST
    // This prevents old sessions from interfering with new invite tokens
    const allCookies = cookieStore.getAll()
    for (const cookie of allCookies) {
      if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
        cookieStore.delete(cookie.name)
      }
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Sign out any existing session before verifying new token
    await supabase.auth.signOut()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      // For invite type, redirect to password setup page
      if (type === 'invite') {
        return NextResponse.redirect(`${origin}/update-password`)
      }
      // For other types (recovery, signup, etc.), redirect to next
      return NextResponse.redirect(`${origin}${next}`)
    }

    // If verification failed, redirect to login with error
    console.error('OTP verification failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=verification_failed`)
  }

  // No token_hash or type provided
  return NextResponse.redirect(`${origin}/login`)
}
