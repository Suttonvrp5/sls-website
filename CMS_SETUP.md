# Staff Admin Panel — Setup Guide

Your site now has a real, form-based admin panel at **yoursite.com/admin** where
staff can add, edit, or remove villa listings — no code, no HTML. This guide
is the one-time setup to switch it on. After this, it just works.

## What you're setting up
- **GitHub** — stores your site's files (free). Every change staff make
  through the admin panel is saved here automatically.
- **Netlify** — hosts your live site and rebuilds it automatically every time
  a villa is added or edited (usually live within ~1 minute).
- **Netlify Identity + Git Gateway** — Netlify's free built-in login system,
  so only people you invite can access the admin panel.

## Setup steps

### 1. Create a GitHub account and repository
1. Go to [github.com](https://github.com) and sign up (free).
2. Create a new repository (e.g. `samui-luxury-stays`). Keep it **private**
   if you don't want the code publicly visible — this doesn't affect the
   live site, which is public either way.
3. Upload this whole folder's contents into that repository. The easiest way:
   on the repository page, click **Add file → Upload files**, then drag in
   everything from this folder.

### 2. Connect the repository to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) and sign up with your
   GitHub account (free tier is enough for this site).
2. Click **Add new site → Import an existing project → Deploy with GitHub**.
3. Pick the repository you just created.
4. Netlify will detect the build settings automatically from `netlify.toml`
   already in this project (build command `node build.js`, publish folder
   `_site`) — just click **Deploy**.
5. Wait for the first deploy to finish, then open the site URL Netlify gives
   you to confirm it looks right.

### 3. Turn on Identity and Git Gateway
1. In your new site's Netlify dashboard, go to **Project configuration →
   Identity** (Netlify recently renamed "Site configuration" to "Project
   configuration" — look for that if you don't see "Site configuration"),
   and click **Enable Identity**.
2. Under **Registration preferences**, set it to **Invite only** (so random
   people can't sign themselves up).
3. Still under Identity, scroll to **Services → Git Gateway** and click
   **Enable Git Gateway**. This is what lets the admin panel securely save
   changes back to GitHub on staff's behalf, without them ever touching Git.
   Note: Netlify has marked Git Gateway as deprecated (it still works, but
   won't receive new features) — if it's ever removed, ask your developer
   about switching Decap CMS to authenticate directly against GitHub
   instead, which doesn't depend on Git Gateway at all.

### 4. Invite your staff
1. In **Identity**, click **Invite users**, and enter each staff member's
   email address.
2. They'll get an email with a link to set a password.
3. Once that's done, they log in at **yoursite.com/admin** and see the
   villa-editing panel directly — they can add a villa, upload a photo,
   fill in bedrooms/area/features, and click **Publish**.

### 5. (Optional) Use your own domain
Under **Domain management** in Netlify, you can point your own domain
(e.g. samuiluxurystays.com) at the site instead of the default
`*.netlify.app` address.

## How it actually works day-to-day
- Staff visit `/admin`, log in, click **New Villa**, fill in the form
  (name, area, style, bedrooms, standout feature, amenities, description,
  location, cover photo, a gallery of more photos, and floor plans), and
  click **Publish**.
- The **Amenities** checklist covers things like Pool, Sea View, Pets
  Allowed, and more — tick everything that applies. Only the first three
  checked appear as tags on the villa card, so put the most important ones
  first.
- **Listing Type** controls whether a villa shows under Rentals, For Sale,
  or both, on the Villas page. Tick "For Sale" and fill in the Sale Price,
  Sale Currency and Ownership Structure fields to show pricing and
  ownership details on that villa's own page and as a badge on its card.
- **Location** (latitude/longitude) puts a pin for that villa on the map on
  the Villas page, and on the villa's own page. Right-click the spot on
  Google Maps to get the two numbers, then paste them in.
- The **Gallery** field is for the picture slider on the villa's own page —
  10 to 12 photos is typical, but add as many or as few as you have.
- **Floor Plans** is a separate list — one entry per floor, each with a
  label (e.g. "Ground Floor") and an image.
- Every villa automatically gets its own page (e.g. `/villas/villa-name.html`)
  with a photo slider, description, amenities, map, and floor plans — staff
  never create these pages by hand, the build script generates them.
- That change is saved to GitHub automatically.
- Netlify notices the change and rebuilds the site within about a minute —
  the new villa then appears live on `villas.html`, its own page, the map,
  and (if featured) the homepage.
- No one needs to touch HTML, download files, or use the code editor again.

## If something looks broken
- Check the **Deploys** tab in Netlify — every build is logged there, and
  failed builds show exactly what went wrong (this is rare; the build
  script is intentionally simple).
- A villa missing a required field will still build — it just prints a
  warning in the deploy log rather than breaking the whole site.
