# Safe Zones — What You Can and Can't Touch

## GREEN — Safe to Modify

| Path | What It Is | Notes |
|------|-----------|-------|
| `src/app/(dashboard)/*.tsx` | Dashboard pages | Main work area — tickets, properties, tenants, contractors, settings |
| `src/components/*.tsx` | UI components | Data tables, drawers, forms, badges, cards |
| `src/components/ui/*.tsx` | shadcn/ui primitives | Buttons, cards, dialogs, etc. Prefer adding new over editing shared ones. |
| `src/components/ticket-detail/*.tsx` | Ticket detail tabs | Overview, conversation, dispatch, completion, activity |
| `src/components/onboarding/*.tsx` | Onboarding wizard steps | CSV upload, editable table, step components |
| `src/lib/normalize.ts` | Phone/address formatting | Pure utility functions |
| `src/lib/validate.ts` | Input validation | Pure utility functions |
| `src/lib/postcode.ts` | UK postcode utilities | Pure utility functions |
| `public/` | Static assets | Images, icons, favicon |

## YELLOW — Ask Faraaz First

| Path | What It Is | Why Ask |
|------|-----------|--------|
| `package.json` | Dependencies | New packages affect bundle size and build time |
| `src/hooks/use-ticket-detail.ts` | Ticket data fetching | Makes multiple Supabase RPC calls. Wrong changes break data flow. |
| `src/hooks/use-edit-mode.ts` | Edit/save state management | Used by multiple components — changes ripple widely |
| `src/lib/constants.ts` | Category and priority values | Values MUST match database exactly (case-sensitive) |
| `src/app/globals.css` | Theme CSS variables | Affects the entire app's appearance |
| `src/contexts/date-range-context.tsx` | Date filter state | Shared across all dashboard pages |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout wrapper | Sidebar, providers, auth check |
| `src/components/sidebar.tsx` | Navigation sidebar | Minor text/icon changes OK, structural changes need review |
| `components.json` | shadcn/ui config | Affects how new shadcn components are generated |

## RED — Never Touch

| Path | What It Is | Why Never |
|------|-----------|-----------|
| `supabase/functions/` | 8 Edge Functions (Deno) | Backend: Twilio, OpenAI, Supabase RPCs. Breaking these breaks WhatsApp. |
| `supabase/migrations/20260327041845_remote_schema.sql` | Core migration (72 functions) | Contains 70+ production RPCs, triggers, RLS policies. See `supabase/core-rpcs/README.md`. |
| `supabase/migrations/20260329000000_whatsapp_room_awareness.sql` | Live c1_context_logic + c1_create_ticket | Current production versions of the two most critical RPCs. |
| `supabase/config.toml` | Supabase project config | Project-level settings |
| `.github/workflows/` | GitHub Actions CI/CD | Auto-deploys Edge Functions on push |
| `src/proxy.ts` | Auth session proxy | Handles cookie-based session refresh on every request |
| `src/contexts/pm-context.tsx` | Auth state provider | Complex race-condition fixes. Do not modify. |
| `src/lib/supabase/` | Supabase client setup | Three files: browser client, server client, middleware client |
| `types/database.ts` | Auto-generated types | Generated from Supabase schema. Manual edits get overwritten. |
| `.env.local` | Environment variables | Keys and config. Never commit, never modify. |
| `src/app/auth/` | Auth callback routes | Handles login/signup callbacks from Supabase |
| `src/app/api/auth/` | Server auth API | Server-side logout endpoint |

## Rule of Thumb

- If the file is about **how things look** → probably Green
- If the file is about **how data flows** → probably Yellow
- If the file is about **auth, backend, or infrastructure** → definitely Red
- If you're unsure → ask Claude, and Claude will check this file or escalate to Faraaz
