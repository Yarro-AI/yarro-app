# Scope Guide — How to Think Like a Pro Dev

Read this once to understand the mental model behind `/scope`. You don't need to re-read it every session.

---

## Vertical Slices, Not Horizontal Layers

**Wrong:** "Build all the RPCs, then build all the UI, then test everything."
Nothing works until everything works. If something breaks, you don't know where.

**Right:** "Build the property creation flow — migration, RPC, UI form, works in browser, ship it."
Each slice is demo-able on its own. Each merge to main is a working product.

## Dependency Order, Not Excitement Order

Before building a slice, ask: "Does this depend on something that isn't shipped yet?"

```
Can't assign tenants to rooms → if rooms don't exist
Can't show compliance per room → if rooms aren't linked
Can't show a useful dashboard → if there's no data
Can't demo to anyone → if they can't sign up
```

Build the thing that unblocks the next thing.

## Journeys Are the North Star

A journey is a user outcome: "New operator signs up and sees a useful dashboard within 10 minutes."

Every slice exists to move the user one step closer to that outcome. When a new idea comes up mid-session:
- "Does this move the user closer to the journey outcome?" → If no, backlog it
- "Is this the current slice?" → If no, it's a future slice. Backlog it for a future session

## Start From the User, Not the Code

Don't think "I need to build a signup page." Think:

> "A new HMO operator finds Yarro. What happens from the moment they land to the moment they think 'this is useful'?"

That's the journey. Every feature is a step on it. If you can't place a feature on a journey, it might not be worth building yet.

## The Daily Rhythm

```
1. What did I ship yesterday?
2. What's the next slice on the journey?
3. /scope it (15 min)
4. Build it (2-4 hours)
5. /ship it (test, merge, push)
6. If time: /scope the next slice
```

One slice, one branch, one merge. Repeat.
