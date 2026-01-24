import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicPage = pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/update-password')

  // Check if auth cookies exist (instant, no network call)
  const hasAuthCookie = request.cookies.getAll().some(
    cookie => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
  )

  // No auth cookies + protected page → redirect to login
  if (!hasAuthCookie && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Has auth cookies + on login page → let client handle redirect
  // (Don't redirect here to avoid loop if PM lookup fails)

  // All other cases → pass through instantly
  return NextResponse.next({ request })
}
