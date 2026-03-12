# Git Workflow — Step by Step

## One-Time Setup

Already done if you followed setup-guide.md. For reference:

```bash
git clone https://github.com/Yarro-AI/yarro-app.git
cd yarro-app
npm install
```

**Verify remote:**
```bash
git remote -v
# origin    https://github.com/Yarro-AI/yarro-app.git
```

You work directly on the org repo — no forking needed. You create feature branches and open PRs to `main`.

---

## Starting New Work

Always start from an up-to-date main branch:

```bash
# Get the latest code
git checkout main
git pull origin main

# Create your feature branch
git checkout -b adam/descriptive-name
```

### Branch Naming

Always prefix with `adam/` and be descriptive:
- `adam/feat-ticket-card-redesign`
- `adam/fix-mobile-sidebar-overflow`
- `adam/style-contractor-badge-colors`
- `adam/refactor-property-form-layout`

---

## During Work

### Committing

Commit often. Small, focused commits are easier to review and revert if needed.

```bash
# Stage specific files (preferred over git add .)
git add src/components/my-component.tsx
git add src/app/(dashboard)/tickets/page.tsx

# Commit with a clear prefixed message
git commit -m "feat: add priority filter to tickets page"
```

### Commit Message Prefixes

| Prefix | Use When |
|--------|----------|
| `feat:` | Adding new functionality |
| `fix:` | Fixing a bug |
| `style:` | CSS/styling changes only (no logic) |
| `refactor:` | Restructuring code without changing behavior |
| `test:` | Testing or test setup changes |

### While Working

- Run `npm run dev` to see changes live
- Check browser DevTools console for errors
- Test on mobile width (375px) using browser DevTools

---

## Finishing Work

### Before Pushing

```bash
# Make sure the build passes
npm run build
```

If the build fails, fix the errors before pushing. The pre-push hook will block you anyway.

### Pushing

```bash
# Push your branch
git push origin adam/your-branch-name
```

### Opening a PR

On GitHub:
1. Go to https://github.com/Yarro-AI/yarro-app — you'll see a banner about your recent push
2. Click "Compare & pull request"
3. Make sure it targets: `Yarro-AI/yarro-app` base: `main`
4. Write a description:
   - **What changed** — brief summary
   - **Why** — what problem does this solve
   - **Screenshots** — if it's a visual change, add before/after screenshots
5. Create the pull request
6. **Wait for Faraaz to review and merge**

---

## After Faraaz Merges Your PR

```bash
# Switch back to main
git checkout main

# Pull the merged changes
git pull origin main

# Delete your old branch (cleanup)
git branch -d adam/old-branch-name
```

---

## Common Situations

### "I need to update my branch with new changes from main"

```bash
# On your feature branch
git pull origin main
# Resolve any conflicts, then continue working
```

### "I made changes on main by accident"

```bash
# Stash your changes
git stash

# Create a proper branch
git checkout -b adam/my-feature

# Apply the stashed changes
git stash pop
```

### "The pre-push hook blocked me"

The build failed. Read the error output, fix the TypeScript errors, then try again:
```bash
npm run build    # See the errors
# Fix them
git add .
git commit -m "fix: resolve build errors"
git push origin adam/your-branch
```

### "I want to undo my last commit"

```bash
# Undo the commit but keep the changes
git reset --soft HEAD~1
```

---

## Rules (Non-Negotiable)

1. **Never push to main** — always use `adam/` feature branches
2. **Never merge your own PRs** — Faraaz reviews everything
3. **Always run `npm run build` before pushing** — catch errors early
4. **One feature per branch** — keeps PRs small and reviewable
