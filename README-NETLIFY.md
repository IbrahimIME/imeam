# IME Additive Manufacturing: Netlify package (v1.5, 27 Oct 2026)

This folder is the website, ready to deploy on Netlify. **Every file the pages need is in this folder**:
the pages make no calls to stratasys.com, Vidyard or Google Fonts. (Some links still take visitors to
stratasys.com pages; see the checklist.)

```
netlify.toml                         Netlify settings: build command, publish folder, functions folder, headers
package.json                         Build dependency (marked, for article text)
build.js                             Build: copies site/ to dist/, generates resource pages, inserts header and footer
partials/                            Shared markup, edited once for all pages
  header.html, footer.html           Site header and footer
  logo-ime.svg, logo-amic.svg, ime45.svg   Logos used by the header and footer
templates/page.html                  Page frame for the generated Resources page and resource pages
templates/printer.html               Printer product page layout (filled from content/printers)
content/                             CMS content, one JSON file per entry: printers/, materials/, a folder per resource type
site/                                The website source, about 18 MB
  index.html, materials.html, materialise.html, amic.html (printer pages are generated)
  admin/                             Decap CMS (index.html, config.yml), served at /admin/
  assets/uploads/                    Images, PDFs and videos uploaded through the CMS
  assets/brand/                      IME logos (lockups, solid and outline marks) as SVG
  assets/stratasys/                  55 Stratasys images from the partner portal (WebP) + Stratasys logo
  assets/video/                      7 background video loops (MP4, 10 s, silent)
  assets/js/three.min.js             three.js r128 for the AMIC 3D facility model (MIT licence)
  assets/fonts/                      Self-hosted fonts (SIL Open Font License)
dist/                                Build output (publish directory); generated, do not edit
netlify/functions/send-form.mjs      Form handler at /api/send-form: emails each lead over SMTP
netlify/lib/whatsapp.mjs             Optional WhatsApp alert for each new lead (called by send-form)
asset-manifest.csv                   Every image and video: file, Stratasys portal title, portal item ID, size
```

## 1. Visual assets (done)

**Images:** the 55 Stratasys images were downloaded from the Stratasys partner portal (my.stratasys.com,
Sales & Marketing > Marketing tools > Images), resized to web size and saved as WebP. `asset-manifest.csv`
lists the portal title and item ID of each file, so any image can be found again in the portal.

**Videos:** the 7 background videos are 10-second silent loops cut from partner-portal videos
(960x540, H.264, 24 fps, about 1.4 MB each). The manifest gives the source video and start time of each
loop. They replace the Vidyard players, so nothing streams from Vidyard any more. To use a different part of
a video, or a higher resolution, download the source video from the portal and cut a
new loop with the same file name.

**Before go-live:** IME to approve every image and video, and confirm their use is covered by the brand and
asset-use rules of IME's Stratasys reseller agreement. The Materialise page uses no Materialise images.

**Production build:** this package has no reviewer bar or review notes (the Claude mockup keeps them for review).
Images have fixed sizes and the page appears once its fonts are loaded (at most 1 s), so nothing jumps or flashes
while loading. Background videos fade in when they start playing.

## 2. Header, footer and build

The header and footer are in `partials/` and are shared by every page. Each page in `site/` has placeholders
instead of the full markup:

```html
<site-header cta-href="#quote-f" cta="Get pricing"><a href="#top" ...>Overview</a>...</site-header>
<site-footer></site-footer>
```

The links inside `<site-header>` are that page's menu. `cta` and `cta-href` set the button on the right;
`home` (default `index.html`) and `logo` (default `ime`, or `amic`) are optional. Run `npm install` once, then
`npm run build` (Node 22 or later) to write the finished pages to `dist/`. Preview `dist/`, not `site/`.

## 3. Deploy

Deploy from **Git**: push this folder to a GitHub, GitLab or Bitbucket repo and connect it in Netlify. Netlify
installs the build dependency, runs `node build.js` and publishes `dist` (all set in `netlify.toml`), with the
forms and the WhatsApp function. The CMS (section 4) needs a Git-connected site: every edit is a commit that
triggers a new build. The **Netlify CLI** (`netlify deploy --build --prod`) and **Netlify Drop** (run the build,
drag `dist`) still publish the pages, but CMS edits only reach the site through Git.

## 4. Content manager (Decap CMS)

The admin site is at **/admin/** (for example https://<your-site>/admin/). Signed-in editors can create, edit
and delete **Printers, Materials, Case Studies, Webinars, Blog posts, eBooks, White Papers, Videos, Spec Sheets
and Safety Data Sheets**, and upload images, PDFs and videos (saved in `site/assets/uploads/`). Saving publishes
the change in about a minute, once Netlify has rebuilt the site. Every collection has a "Hidden" switch to take
an entry off the site without deleting it.

**Printers** (homepage Printers section): name, technology, filter buttons it appears under, order, card text,
image and a "New to IME site" badge. Switching on **Product page** turns the card into a link to its own page,
`printer-<file name>.html`, laid out like the F3300 page (`templates/printer.html`): hero with key facts and video,
features and benefits, specifications, applications, compare row, IME support and a pricing form (Netlify form
`printer-pricing`, with the printer's name as the inquiry type). Empty fields fall back to defaults built from the
card; Features, Specifications and Applications are left out (with their menu links) when empty. The old
`printer.html` address redirects to `printer-f3300.html` (`netlify.toml`).

**Materials** (materials.html catalogue): name, technology and tags. The catalogue is sorted by technology, then
name, and the "81 materials" and "shown" counts update automatically.

**Resources**: title, date, source (e.g. IME, Stratasys), summary, cover image, "Show on homepage", external
link, PDF download, video (MP4 upload or YouTube/Vimeo link) and an optional article. Where they appear:
- **resources.html**: every entry, newest first, with filters by type and a search box. Links such as
  `resources.html#safety-data-sheets` open with that filter on (the homepage chips and footer use them).
- **Homepage, Resources section**: the six newest entries with "Show on homepage" ticked.
- **Own page** (e.g. `blog-my-post.html`) when the article field is filled. Without an article, the card links
  to the PDF, or else to the external link.

One-time setup in the Netlify dashboard (after the Git deploy above):
1. **Project configuration > Identity > Enable Identity.**
2. Identity > **Registration: Invite only**, so nobody can sign themselves up.
3. Identity > Services > **Git Gateway > Enable**. This lets editors save to the repo without their own
   Git account.
4. Identity > **Invite users**: each editor gets an email, sets a password and lands on /admin/.

The repo's default branch must be `main` (or change `branch` in `site/admin/config.yml`). Netlify reversed its
planned deprecation of Identity in February 2026; if Identity or Git Gateway is ever withdrawn, change
`backend` in `config.yml` to `github` and have editors sign in with GitHub accounts that can write to the repo.

The build stops, and the live site stays as it was, if an entry's link, download or image field holds an unsafe
URL (for example one starting with `javascript:`); the Netlify deploy log names the file. Unsafe links inside an
article are removed with a warning instead.

To edit content on your own computer without signing in: run `npm run cms` in this folder, serve `site/` with
any static server (for example `npx serve site`) and open its /admin/ page. Changes are written straight to
`content/`; run `npm run build` to see them in `dist/`.

## 5. Forms and email (SMTP)

The four forms (homepage enquiry, F3300 pricing, AMIC visit with CAD upload, Materialise licensing) post to
`/api/send-form`, a Netlify Function (`netlify/functions/send-form.mjs`) that emails each lead through IME's own
SMTP server. Netlify Forms is not used, so leave form detection off.

1. Get SMTP details for a sender mailbox (for example `web@cadcam.com.my`): host, port, login and password.
   - **Microsoft 365:** `smtp.office365.com`, port 587. The mailbox needs **Authenticated SMTP** turned on
     (Microsoft 365 admin > user > Mail > Manage email apps). Microsoft has been retiring basic-auth SMTP in
     Exchange Online, so check with IT that it still works for IME's tenant. If it doesn't, use a
     transactional email service's SMTP (for example Brevo, Amazon SES or SendGrid) with `cadcam.com.my`
     verified as the sending domain.
   - **Gmail / Google Workspace:** `smtp.gmail.com`, port 465, with an app password (needs 2-step verification).
2. In Netlify: **Site configuration > Environment variables**, add (tick **Secret** for `SMTP_PASS`):

   | Variable | Example |
   |---|---|
   | `SMTP_HOST` | `smtp.office365.com` |
   | `SMTP_PORT` | `587` (STARTTLS) or `465` (TLS) |
   | `SMTP_USER` | `web@cadcam.com.my` |
   | `SMTP_PASS` | the mailbox or app password |
   | `MAIL_FROM` | `IME Website <web@cadcam.com.my>` (must be an address the SMTP login may send as) |
   | `MAIL_TO` | `info.3dp@cadcam.com.my,stevenyap@cadcam.com.my,malone@cadcam.com.my,joey.lin@cadcam.com.my` |
   | `MAIL_BCC` | optional |
   | `MAX_UPLOAD_MB` | optional, default `4` (Netlify caps a function request at about 6 MB) |

3. Redeploy (Deploys > Trigger deploy), then submit one test enquiry from each page and check that every
   inbox receives it. Each email's **Reply-To** is the visitor, so replying answers them directly; CAD files
   from the AMIC form arrive as attachments.

If a submission fails, the visitor sees "Sorry, your request was not sent…" and the reason is in **Logs >
Functions > send-form** (for example a missing variable or the SMTP server refusing the login). The SMTP
password never appears in the pages or the repo.

Spam protection: a hidden honeypot field (bots that fill it get a fake "sent" and nothing is emailed),
posts from other websites are refused, and only the four known forms, valid emails, the PDPA consent tick
and CAD file types (STEP, STP, STL, 3MF, OBJ, IGES) are accepted. Have IME's legal or compliance team approve the
PDPA wording. Unlike Netlify Forms, submissions are not stored in Netlify: the emails are the record.

## 6. WhatsApp (main +60 12-301 0100; copies +60 16-626 8869 and +60 12-322 6673)

WhatsApp has no "cc". There are two ways to reach all three numbers:

- **Visitor's "WhatsApp us" button (already working):** opens a chat with the main number,
  +60 12-301 0100, pre-filled with what the visitor typed. A wa.me link can only open a chat with one number,
  so the copies don't get this message. If all three people should see these chats, either use the
  WhatsApp Business app's multi-device linking on the main number (up to a few linked devices;
  check WhatsApp's current limit), or forward from the main phone.
- **Automatic alert for every lead (to all three):** after emailing a lead, `send-form` calls `netlify/lib/whatsapp.mjs`, which sends the same
  WhatsApp template message to the main number and to each copy number, through Meta's WhatsApp Business
  Cloud API. It needs:
  1. A Meta Business account with WhatsApp Cloud API set up and a **sender** number registered to it. None of
     the three receiving numbers can be the API sender while it is used in the normal WhatsApp app.
  2. An approved **Utility** message template with four body variables, for example:
     `New website lead ({{1}}) from {{2}}. Contact: {{3}}. Details: {{4}}`
  3. These Netlify environment variables: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`,
     `WHATSAPP_TEMPLATE_LANG` (e.g. `en`), `GRAPH_API_VERSION` (e.g. `v21.0`),
     `LEAD_ALERT_TO` = `60123010100`, `LEAD_ALERT_CC` = `60166268869,60123226673`.
  Until they are all set, the function does nothing and the forms work normally. Meta charges per template
  message (three per lead here): check the current Malaysian rate. Check the request format against Meta's
  current WhatsApp Cloud API documentation before switching it on.

## 7. Leads dashboard

The "IME AM Leads" dashboard (a separate Claude artifact) shows leads by day and inquiry type, pipeline
status, and a searchable table of every lead. It currently shows **sample data**. Once the site is live and
the email notifications in step 5 arrive in Joey's inbox, a daily scheduled task can read the new
notification emails and add the leads to the dashboard. Set that up after the first real test submission, so
the task is built against the real email format.

## 8. Before go-live checklist

- IME approval of all Stratasys images and videos (see `asset-manifest.csv`)
- Decide whether the remaining "read more" links to stratasys.com (F3300 page, materials, buyer's guide,
  SAF design guide, Siemens case study) stay as links or are rebuilt as IME pages
- SMTP environment variables set; a test from each of the four forms received by every `MAIL_TO` inbox
- PDPA consent wording and privacy-notice link approved
- Markforged stays hidden on the Netlify build (no reviewer bar, fixed to Hidden). To publish it, change
  `MF_DEFAULT=false` to `MF_DEFAULT=true` in each of the five HTML pages in `site/` (or ask for a rebuild), then redeploy
- Netlify Identity on (invite only), Git Gateway on, editors invited and able to save a test entry
- Custom domain and HTTPS set in Netlify; AMIC standalone domain redirect decided
