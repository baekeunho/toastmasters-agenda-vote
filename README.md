# Toastmasters Agenda + Feedback/Vote

A minimalist, no-server, no-login webpage for running a Toastmasters club
meeting: publish the agenda, let attendees vote for Best Speaker / Best
Table Topics Speaker / Best Evaluator on their own phones, and collect
written speech feedback — all from a page you can host for free on GitHub
Pages.

There is no server to run and no accounts to manage. The only "backend" is
a Google Sheet + a free Google Apps Script Web App that your own club
deploys and owns.

## How it works

- `index.html` — the attendee-facing page: agenda, voting, feedback forms.
- `edit.html` — an unlisted page (not linked from `index.html`) where the
  officer running the meeting publishes/edits the agenda.
- `apps-script/Code.gs` — pasted into your club's own Google Apps Script
  project. Stores the agenda, votes, and feedback in a Google Sheet.
- `js/config.js` — the one file you edit after forking: your Apps Script
  Web App URL, club name, and an optional edit PIN.

Voting has no login, so duplicate-vote prevention is honor-system: each
browser remembers (via `localStorage`) which categories it already voted
in for the *current* agenda, and that memory resets automatically the next
time a new agenda is published. It's not bulletproof (clearing browser
data or using another device gets around it), which is an accepted
tradeoff for a club meeting, not a bug.

## Set up your own club's copy

1. **Fork this repository** (or use it as a template) on GitHub.
2. **Create a new Google Sheet** — a blank one is fine.
3. In the Sheet, go to **Extensions → Apps Script**, delete the default
   code, and paste in the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
4. In the Apps Script editor, select the `setupSheets_` function from the
   function dropdown and click **Run** once. This creates the `Meta`,
   `Agenda`, `Votes`, and `Feedback` tabs with the right headers. The first
   run will ask you to authorize the script — that's expected, it's your
   own script running on your own Sheet.
5. *(Optional)* If you want light friction on who can publish the agenda,
   go to **Project Settings → Script Properties** and add a property named
   `EDIT_PIN` with a PIN of your choice. Leave it unset if you don't want
   this.
6. Click **Deploy → New deployment**. Choose type **Web app**. Set
   "Execute as" to **Me**, and "Who has access" to **Anyone**. Deploy, and
   authorize again if asked. Copy the resulting URL (it ends in `/exec`).
7. In your forked repository, edit [`js/config.js`](js/config.js):
   - `WEB_APP_URL`: paste the URL from step 6.
   - `CLUB_NAME`: your club's name.
   - `EDIT_PIN`: the same PIN from step 5, if you set one (this is just UI
     friction, not real security — see the comment in that file).
   Commit and push the change.
8. In your repo's **Settings → Pages**, enable GitHub Pages, deploying
   from the `main` branch, root folder.
9. Visit `https://<your-username>.github.io/<repo-name>/edit.html`
   (bookmark this — it's intentionally not linked anywhere) and publish
   your first agenda. Then visit `.../index.html` to confirm voting and
   feedback work, and share that link or a QR code of it with attendees.

### Updating `Code.gs` later

If you ever change `apps-script/Code.gs`, saving it in the Apps Script
editor is not enough to update the live URL — go to **Deploy → Manage
deployments → Edit (pencil icon) → New version → Deploy**.

### Seeing results

Votes and feedback land directly in your Google Sheet's `Votes` and
`Feedback` tabs, filterable by `meetingId` (each published agenda gets a
new one). Publishing a new agenda does not clear old votes or feedback, so
last week's results stay in the Sheet. A quick tally formula, e.g. in a
spare cell:

```
=QUERY(Votes!A:D, "select C, D, count(D) where B = '"&Meta!B2&"' group by C, D")
```

## Customizing

- Colors: change `--accent` near the top of `css/style.css`.
- Club name: `CLUB_NAME` in `js/config.js`.
- Everything is plain HTML/CSS/JS with no build step, so any text or
  behavior can be edited directly in the files and pushed.

## License

MIT — see [LICENSE](LICENSE). Free to fork and adapt for your own club.
