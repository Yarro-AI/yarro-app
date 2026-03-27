# Morning PRD Skill

## Purpose
Generate a focused, codebase-aware task file before each build session.
This skill reads the existing codebase context and produces a PRD that
Claude can execute precisely without making assumptions.

## When To Use
Run this skill at the start of every day before any building begins.
Trigger: "Run morning PRD skill for [task name]"

## Process

### Step 1 — Read context
Before generating anything, read:
- CLAUDE.md (project rules, stack, patterns)
- SESSION_LOG.md (what was last worked on, what's pending)
- .claude/tasks/BACKLOG.md (captured ideas and next steps)
- Any files directly relevant to today's task

### Step 2 — Ask one question
Ask Adam: "What is the one thing we are building today?"
Do not proceed until this is answered clearly.

### Step 3 — Generate the task file
Create a file at .claude/tasks/YYYY-MM-DD-[taskname].md

Use this structure:

---
## Task: [name]
**Date:** YYYY-MM-DD
**Branch:** feat/[taskname]
**Status:** In Progress

### Goal
One clear sentence on what this builds and why it matters for HMO agencies.

### Context
- Which existing files are involved
- Which database tables are touched
- Which components are affected
- Any patterns from patterns.md to follow

### Behaviour
Bullet list of exactly how the feature should work from the user's perspective.
Written as: "The user can..." or "The system shows..."

### Technical Plan
Step by step implementation plan.
Claude states this — Adam approves before any code is written.

### Constraints
- What must not be changed
- Which caution zone files to avoid
- Any patterns that must be followed

### Done When
Specific checklist:
- [ ] npm run build passes clean
- [ ] Feature works visually in browser
- [ ] Data persists on page refresh
- [ ] No console errors
- [ ] Works at 375px mobile width
- [ ] Works in dark mode
- [ ] SESSION_LOG.md updated
- [ ] Committed and pushed to task branch

### Notes
Anything that came up during the session that goes to BACKLOG.md
---

### Step 4 — Create the branch
After Adam approves the plan, create the branch:
git checkout feat/hmo-compliance
git pull
git checkout -b feat/[taskname]

### Step 5 — Confirm ready
Tell Adam: "Task file created, branch created, ready to build.
Confirm and I will start."
Do not write any code until Adam confirms.
