# Plan: Align signup + login page colours with sidebar

## Context
Signup and login pages use `bg-[#101011]` (near black) for the left branding panel. The sidebar uses `#162B45` (dark navy). They should match for visual consistency.

## Changes

1. `src/app/signup/page.tsx` line 54: `bg-[#101011]` → `bg-[#162B45]`
2. `src/app/login/page.tsx` line 93: `bg-[#101011]` → `bg-[#162B45]`

Two lines. That's it.
