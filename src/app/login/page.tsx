'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import { ArrowLeft } from 'lucide-react'
import { typography } from '@/lib/typography'

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
    // Only navigate if we have a PM, no error, and not in forgot password mode
    if (propertyManager && !error && mode === 'login') {
      router.push('/')
    } else if (authSuccess && !propertyManager) {
      // Auth succeeded but no PM record — new user needs onboarding
      router.push('/import')
    }
  }, [pmLoading, propertyManager, authSuccess, error, mode, router])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Read from form directly to handle browser auto-fill
    // (auto-fill doesn't trigger React onChange, so state may be empty)
    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string || '').toLowerCase().trim()
    const passwordValue = formData.get('password') as string || ''

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
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

    // Auth successful — wait for PM context to detect the auth state change
    // This delay prevents race condition where useEffect runs before pmLoading updates
    await new Promise(resolve => setTimeout(resolve, 500))

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
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo-wordmark.png"
            alt="Yarro"
            width={120}
            height={40}
            className="mx-auto"
            priority
          />
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
          <div className="px-8 py-8">
            {mode === 'login' ? (
              <>
                <div className="space-y-1 mb-6">
                  <h1 className={`${typography.pageTitle} text-center`}>Welcome back</h1>
                  <p className="text-sm text-muted-foreground text-center">
                    Sign in to your account
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback?next=/`,
                      },
                    })
                  }}
                  className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-border/60 bg-transparent text-sm font-medium text-foreground hover:border-primary/30 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Sign in with Google
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      Email
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium text-foreground">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(null) }}
                        className="text-sm text-primary hover:underline"
                      >
                        Forgot?
                      </button>
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                      {error}
                    </div>
                  )}

                  <InteractiveHoverButton
                    type="submit"
                    text={loading ? 'Signing in...' : 'Sign in'}
                    disabled={loading}
                    className="w-full font-medium"
                  />
                </form>
              </>
            ) : (
              <>
                <div className="space-y-1 mb-6">
                  <button
                    onClick={() => { setMode('login'); setError(null); setResetSent(false) }}
                    className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </button>
                  <h1 className={`${typography.pageTitle} text-center`}>Reset password</h1>
                  <p className="text-sm text-muted-foreground text-center">
                    We&apos;ll send you a reset link
                  </p>
                </div>

                {resetSent ? (
                  <div className="text-sm text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-4 py-3 rounded-lg">
                    Check your email for a password reset link.
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="reset-email" className="text-sm font-medium text-foreground">
                        Email
                      </label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 rounded-xl"
                        required
                      />
                    </div>

                    {error && (
                      <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                        {error}
                      </div>
                    )}

                    <InteractiveHoverButton
                      type="submit"
                      text={loading ? 'Sending...' : 'Send reset link'}
                      disabled={loading}
                      className="w-full font-medium"
                    />
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a href="/signup" className="text-primary hover:underline font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
