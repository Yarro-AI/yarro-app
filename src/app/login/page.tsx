'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [resetSent, setResetSent] = useState(false)
  const [authSuccess, setAuthSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { propertyManager, loading: pmLoading } = usePM()

  // Navigate to dashboard once PM is confirmed loaded
  // Handles: (1) already logged in user landing on /login, (2) after fresh login
  useEffect(() => {
    if (pmLoading) return
    if (propertyManager) {
      router.push('/')
    } else if (authSuccess) {
      // Auth succeeded but no PM record found — user removed from system
      setError('Account not found. Please contact your administrator.')
      setLoading(false)
      setAuthSuccess(false)
    }
  }, [pmLoading, propertyManager, authSuccess, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : authError.message
      )
      setLoading(false)
      return
    }

    // Auth successful — wait for PMProvider to load the PM before navigating
    // This prevents the race condition where dashboard mounts before PM is fetched
    setAuthSuccess(true)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` }
    )

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#101011] items-center justify-center p-12">
        <div className="max-w-md text-center">
          <Image
            src="/logo-white.png"
            alt="Yarro"
            width={200}
            height={60}
            className="mx-auto mb-8"
            priority
          />
          <p className="text-white/70 text-lg leading-relaxed">
            Property maintenance automation. <br />
            Streamlined for property managers.
          </p>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Image
              src="/logo-wordmark.png"
              alt="Yarro"
              width={120}
              height={40}
              className="mx-auto"
              priority
            />
          </div>

          {mode === 'login' ? (
            <>
              <div className="space-y-2 mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-[#101011]">Welcome back</h1>
                <p className="text-[#606266]">
                  Sign in to your account to continue
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-[#101011]">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 bg-white border-[#e0e7ef] text-[#101011]"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-[#101011]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null) }}
                      className="text-sm text-[#0059FF] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-white border-[#e0e7ef] text-[#101011]"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#0059FF] hover:bg-[#0047cc] text-white font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="space-y-2 mb-8">
                <button
                  onClick={() => { setMode('login'); setError(null); setResetSent(false) }}
                  className="flex items-center text-sm text-[#606266] hover:text-[#101011] mb-4"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to sign in
                </button>
                <h1 className="text-2xl font-semibold tracking-tight text-[#101011]">Reset password</h1>
                <p className="text-[#606266]">
                  Enter your email and we&apos;ll send you a reset link
                </p>
              </div>

              {resetSent ? (
                <div className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg">
                  Check your email for a password reset link. It may take a minute to arrive.
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="reset-email" className="text-sm font-medium text-[#101011]">
                      Email
                    </label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 bg-white border-[#e0e7ef] text-[#101011]"
                      required
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-[#0059FF] hover:bg-[#0047cc] text-white font-medium"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send reset link'
                    )}
                  </Button>
                </form>
              )}
            </>
          )}

          <p className="mt-8 text-center text-sm text-[#606266]">
            Need help? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
