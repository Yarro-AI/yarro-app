'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string || '').toLowerCase().trim()
    const passwordValue = formData.get('password') as string || ''

    if (passwordValue.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { error: signupError } = await supabase.auth.signUp({
      email: emailValue,
      password: passwordValue,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    setEmailSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm">
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
            {emailSent ? (
              <div className="space-y-4">
                <div className="space-y-1 mb-2">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground text-center">Check your email</h1>
                  <p className="text-sm text-muted-foreground text-center">
                    We&apos;ve sent a verification link to <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>
                <div className="text-sm text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-4 py-3 rounded-lg">
                  Check your spam folder if you don&apos;t see it.
                </div>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Back to sign in
                  </Link>
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1 mb-6">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground text-center">Create your account</h1>
                  <p className="text-sm text-muted-foreground text-center">
                    Start your 14-day free trial
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
                  Sign up with Google
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
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
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                      Password
                    </label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl"
                      minLength={6}
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
                    text={loading ? 'Creating account...' : 'Create account'}
                    disabled={loading}
                    className="w-full font-medium"
                  />
                </form>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  By signing up, you agree to our terms of service.
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
