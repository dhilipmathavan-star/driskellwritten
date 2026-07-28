# Driskell Written — CMS go-live (one-time setup)

The no-code editor (**Decap CMS**) is built and tested. Immanuel/Chaise will edit the
site at **driskellwritten.netlify.app/admin** — no code, no monthly fee.

Everything on the code side is done. What's left are a few **dashboard clicks that only
you can do** (they need account access I can't perform for you). ~15 minutes, once.

> **How it works:** the editor saves changes → they're committed to the site's Git repo →
> Netlify automatically re-publishes. So the site must (a) live in a Git repo and (b) deploy
> from that repo. Right now it deploys manually, so Steps 1–2 switch it over.

---

## Step 1 — Put the site in a GitHub repo

1. Sign in (or make a free account) at **github.com**.
2. Create a new repository — name it e.g. `driskellwritten`. Private is fine.
3. From this folder (`driskellwritten-v2`), push it up. In Terminal:

```bash
cd /Users/sethumathavan/remotion/driskellwritten-v2
git init
git add .
git commit -m "Driskell Written site + Decap CMS"
git branch -M main
git remote add origin https://github.com/<your-username>/driskellwritten.git
git push -u origin main
```

*(Tell me when you're ready and I'll run the `git init/add/commit` part for you — you just
create the GitHub repo and do the `push`, which needs your GitHub login.)*

---

## Step 2 — Point the existing Netlify site at that repo

1. Netlify dashboard → your **driskellwritten** site.
2. **Site configuration → Build & deploy → Continuous deployment → Link repository**
   (on some accounts it's **Deploys → Link site to a Git repository**).
3. Choose **GitHub**, authorize, pick the `driskellwritten` repo, branch **`main`**.
4. Build settings: **Build command = (leave empty)**, **Publish directory = `.`**
   (a `netlify.toml` in the repo already sets this).
5. Deploy. The site now rebuilds automatically on every save. *(This replaces the old
   manual `netlify deploy` — you won't need that command anymore.)*

---

## Step 3 — Turn on logins (Netlify Identity + Git Gateway)

1. Netlify site → **Identity** → **Enable Identity**.
2. Under **Identity → Registration**, set **Invite only** (so nobody random can sign up).
3. Under **Identity → Services → Git Gateway → Enable Git Gateway.**
   *(This is what lets Immanuel log in with just an email + password — no GitHub needed.)*

> ⚠️ **Heads-up:** Netlify has been winding Identity down. If the dashboard won't let you
> enable it, **don't worry — tell me** and I'll switch the login over to a GitHub-login
> method (works the same; Immanuel would just sign in with a free GitHub account) or another
> free option. It's a small config change on my side.

---

## Step 4 — Invite the editors

1. Netlify site → **Identity → Invite users**.
2. Enter Immanuel's email (and Chaise's / yours). They get an email → click it → set a
   password.

---

## Step 5 — Done. They edit here:

**https://driskellwritten.netlify.app/admin** → *Login* → edit → *Publish*.
Changes go live automatically in ~1 minute.

---

### Notes
- **What's editable:** the home-page "Work" slider (add / edit / reorder / remove
  screenplays, with poster images + PDFs), and the key site wording (hero, about, footer,
  contact email) — in all four languages.
- **Safety net:** the site keeps its current content hard-coded as a fallback. If the CMS
  files ever go missing, the site still shows exactly what it shows today — nothing breaks.
- **Local preview** (for you): `python3 -m http.server 8200` in this folder, then open
  `localhost:8200/admin` and run `npx decap-server` in another tab — it works with no login
  for testing.
