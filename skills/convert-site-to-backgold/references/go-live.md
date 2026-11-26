# Going live

The cutover from the old host to BackGold hosting, in the order that keeps
the site up. It is written so it can be pasted to whoever does it. Fill in
the names in angle brackets first.

Do the steps in order, and stop and report at any step that does not end as
described. Do not merge the pull request before step 5.

## What a person must supply

Ask for these. Never guess one, and never have a secret pasted into a
conversation: it is exported in the shell.

| What | Where it comes from | It is not |
| --- | --- | --- |
| Someone signed in to BackGold as an owner or admin of the organization, to enter the content and make the token | The organization | A site key |
| A **deploy token**, `bg_deploy_…` | BackGold → Sites → the site → Developer → make a deploy token. Shown once; opens this one site. | `bg_site_pk_…` or `bg_site_sk_…`, which read content and cannot deploy |
| Access to wherever the domain's DNS is managed, and to the old host | The organization | — |
| Custom sites turned on for the organization | BackGold staff | A plan change |

## 1. Enter the content in BackGold

Follow `CONTENT-PLAN.md` in the repository, top to bottom, in the BackGold
app, signed in as the organization. It names every content type, entry,
post, page, form, menu link and redirect to create, with exact labels.

**If the organization already has sites**, do not pick one yourself: the
owner decides which becomes the real site. What to tell them:

- a site that already holds the domain, even unverified, is usually the one
  to fill: another site cannot take that domain until it is removed there;
- the organization's home site (the one at its `backgold.com` address) is
  usually left alone;
- the site prints its own name in titles and the header, so a site named
  for its domain needs renaming in BackGold first.

**Pages a hosted site refuses.** Until its first deploy is promoted the site
is a hosted one, and a hosted site will not take a page at `/donate`,
`/join`, `/store`, `/events` or BackGold's other addresses, nor the page
drawn above the posts. The plan marks them. Either switch the site to
headless on its Developer page while entering pages (its own hosted pages
are not drawn meanwhile, which matters only if something public depends on
them), or enter those pages after step 5.

When it is done, have the owner look over the pages, the menus and the
entries in BackGold. The site's own check comes in step 4.

## 2. Nothing is live yet

The site in BackGold is an ordinary hosted one until a deploy is promoted,
and the domain still points at the old host. Leave both alone.

## 3. Link the repository and set the token

The person makes the deploy token, exports it as `BACKGOLD_DEPLOY_TOKEN`, and
saves the same value as the repository's CI secret `BACKGOLD_DEPLOY_TOKEN`.
Then, on the branch:

```bash
npx backgold link          # writes the site's id into backgold.json
git add backgold.json && git commit -m "Link the site on BackGold hosting"
git push
```

The token is never written to a file. If the site was switched to headless
mode (to get a key for local work, or to enter pages), switch it back to
hosted first: a headless site refuses a deploy.

## 4. Look at the preview

With the workflow from `assets/deploy.yml`, that push deploys a preview named
for the pull request. Without it:

```bash
npx backgold deploy --preview first
```

Then `npx backgold previews` prints the preview's address. Open every address
on the conversion's list there, at a phone width and a desktop width:

- the home page and each kind of page (a list, an entry, a post);
- the header and footer menus, and the header button;
- anything drawn from the site's details (phone, hours);
- each form: its frame must show its fields. Do not submit one yet;
- an address that does not exist (the 404);
- every route the site added (`/weather.json`).

A preview answers `X-Robots-Tag: noindex` and counts no views. That is
expected.

## 5. Promote

Merge the pull request when CI promotes on `main`, or:

```bash
npx backgold deploy --promote
npx backgold deploys       # the newest deploy is marked live
```

Nothing public changes yet. A custom site is served only on its connected
domain, and the domain still points at the old host.

Promote **before** connecting the domain. Until the first promote the site is
a hosted one, and a domain connected to it would show BackGold's default
rendering of the pages to the public.

## 6. Move the domain

Do the two halves close together: the site is unreachable in between.

1. In BackGold → Sites → the site → Domain, connect the domain. Follow the
   records that page shows, exactly. If the site already lists the domain
   as not verified (from an earlier attempt), do not add it again; if
   another site of the organization holds it, it must be removed there
   first, by a person, in BackGold.
2. At the old host, release the domain (for a Cloudflare Worker: Workers &
   Pages → the Worker → Settings → Domains & Routes, remove its custom
   domains). **Do not delete the old site.**
3. At the DNS provider, add the records BackGold's Domain page asks for. On
   Cloudflare DNS, set them to **DNS only** (grey cloud): a proxied (orange
   cloud) record does not work here.
4. Back on the Domain page, verify. Wait until it shows the domain connected
   and its certificate issued.
5. **The other name.** BackGold serves the one address that was connected
   and does nothing for the other (`www` when the bare domain is the site,
   or the reverse). Redirect it at the DNS provider. On Cloudflare: add a
   proxied (orange cloud) `AAAA` record for `www` with the value `100::`, a
   placeholder so Cloudflare answers for the name, and a Redirect Rule
   sending `www.<domain>/*` to `https://<domain>/` with the path and query
   kept, status 301. The connected name's own record stays DNS only.

## 7. Check the live site

On the real domain:

- the same pages as step 4;
- `/robots.txt` allows crawling and names the sitemap; `/sitemap.xml` lists
  the pages;
- the other name (`www`, or the bare one) answers 301 to the same path on
  the connected name;
- submit one form with clearly marked test words, and confirm in BackGold
  that the response arrived and the contact carries the form's tag. Tell the
  owner so they can remove the test contact.

## If something is wrong

- **A bad deploy**: `npx backgold rollback` makes the previous deploy live
  again in a second.
- **The domain**: remove the records from step 6.3 and give the domain back
  to the old host. That is why the old site stays up, untouched, until the
  new one has been live and checked for a few days.
- **Content**: fix it in BackGold. BackGold is the record; the content plan
  is history once the owner is editing there.

## Rules for whoever runs this

- Never commit or print a token, a key or a password.
- No changes to the site's code as part of the cutover. If a page is wrong on
  the preview, report it; do not patch around it.
- Report back: the site id, the live deploy's id, the preview address that
  was checked, and anything in step 4 or 7 that did not match.
