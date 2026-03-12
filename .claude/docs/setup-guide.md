# Yarro PM — First-Time Setup

> **This file is for Claude to execute, not for Adam to read manually.**
> Claude: run through these stages yourself. Execute commands, create files, guide Adam step-by-step through any browser actions. Adam should never have to figure something out alone — you walk him through every click.

---

## Pre-requisites (check first)

- Adam has VS Code and Claude Code working (you're reading this, so yes)
- Adam has a GitHub account
- Adam has access to the `Yarro-AI/yarro-app` repo (Faraaz has added him as a collaborator)

Start by asking Adam: "Have you been added to the Yarro-AI GitHub org? You should have an invitation from Faraaz."

---

## Stage 1: Clone the Repo

Ask Adam where he'd like the project folder. Suggest ~/Documents/.

```bash
git clone https://github.com/Yarro-AI/yarro-app.git ~/Documents/yarro-app
cd ~/Documents/yarro-app
```

No forking needed — Adam works directly on the org repo with feature branches.

---

## Stage 2: Install Dependencies

```bash
npm install
```

---

## Stage 3: Environment Variables

Create `.env.local` in the project root with these values (public keys, safe to include):

```
NEXT_PUBLIC_SUPABASE_URL=https://qedsceehrrvohsjmbodc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHNjZWVocnJ2b2hzam1ib2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MzE4NjIsImV4cCI6MjA3NjUwNzg2Mn0.pXX2Yu68kGpeqXOUa5GCuA7RYKiC-TQsHH0iNuUfXUs
```

---

## Stage 4: Pre-Push Safety Hook

Create `.git/hooks/pre-push` with this content and make it executable:

```bash
#!/bin/sh
echo "Running build check before push..."
npx next build 2>&1 | tail -5
BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  echo "Build failed - push blocked. Fix the errors above and try again."
  exit 1
fi
echo "Build passed - pushing..."
```

```bash
chmod +x .git/hooks/pre-push
```

---

## Stage 5: Verify Local Works

```bash
npm run build
```

If build passes, start the dev server:
```bash
npm run dev
```

Tell Adam: "Open http://localhost:3000 in your browser and log in with your existing Yarro credentials. Let me know when you can see the dashboard."

---

## Stage 6: Vercel Preview (Optional)

Walk Adam through every click:

1. "Open https://vercel.com in your browser"
2. "Click **Sign Up** — choose **Continue with GitHub** so it links to your account automatically"
3. "Once you're in, click **Add New Project**"
4. "You'll see a list of your GitHub repos. Find **yarro-app** and click **Import**"
5. "Before deploying — scroll down and look for **Environment Variables**. Add these two:"
   - Click "Add", name: `NEXT_PUBLIC_SUPABASE_URL`, value: `https://qedsceehrrvohsjmbodc.supabase.co`
   - Click "Add" again, name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHNjZWVocnJ2b2hzam1ib2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MzE4NjIsImV4cCI6MjA3NjUwNzg2Mn0.pXX2Yu68kGpeqXOUa5GCuA7RYKiC-TQsHH0iNuUfXUs`
6. "Now click **Deploy** and wait a couple of minutes"
7. "When it says **Ready**, click the preview link and check you can log in"

Tell Adam: "This is your preview URL. Every time you push code to a branch, Vercel automatically builds a new preview so you can check your changes live."

---

## Stage 7: Test the Full Workflow

Run a small test to prove everything works end-to-end:

1. Create a branch: `git checkout -b adam/test-setup`
2. Make a tiny safe change (e.g. add a small comment in a dashboard component)
3. Commit: `git commit -m "test: verify dev setup"`
4. Push: `git push origin adam/test-setup`
5. Walk Adam through the PR:
   - "Go to https://github.com/Yarro-AI/yarro-app. You'll see a yellow banner that says your branch had recent pushes."
   - "Click **Compare & pull request**"
   - "Make sure it's targeting `main` branch"
   - "Add a short description like 'Test setup — first PR' and click **Create pull request**"
   - "That's it — Faraaz will review it. Never merge your own PRs."

---

## Stage 8: Done

Tell Adam:

"Setup complete! Here's how this works from now on:
- Tell me what you want to work on and I'll guide you through it
- I'll explain what the code does and walk you through changes step by step
- If something needs Faraaz (backend stuff, database changes), I'll write you a message to send him
- Before you close a session, I'll save our progress so we can pick up next time"

Update SESSION_LOG.md with setup completion.
