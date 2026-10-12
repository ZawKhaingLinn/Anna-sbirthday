# Birthday Wishbox — GitHub Pages + Supabase

A responsive React birthday invitation with a private host control panel, personal guest links, RSVPs and a shared wish inbox. Guests do not need email or accounts. GitHub Pages serves the frontend and Supabase runs the database and host authentication; your computer can be off.

## Publication status

This package is ready to upload, but it is **not a live deployment** until the Supabase setup and GitHub Pages workflow finish. The original `BirthdayInvitation.html` is a separate local demo and cannot provide a shared online inbox.

## 1. Create the online database

1. In [Supabase](https://supabase.com/dashboard), create a dedicated project named **Birthday Wishbox** in your chosen organization. Review the displayed plan, project quota and cost before creating it. Keep `wishbox_private` out of the Data API's exposed schemas.
2. Open **SQL Editor** and run `supabase/migrations/202610120001_wishbox.sql` once. This creates private tables and a restricted RPC endpoint. Existing local-demo names and wishes are not uploaded or migrated.
3. In **Authentication → Users → Add user**, create your host account with a password. Auto-confirm the account if the dashboard offers that option. No invitation or confirmation emails are required for the guests. Do not put the password into source files or GitHub.
4. Copy that user's UUID and run the following in SQL Editor, replacing the placeholder:

```sql
insert into wishbox_private.admins (user_id)
values ('YOUR-HOST-USER-UUID'::uuid);
```

5. Disable public user sign-ups in Supabase Auth if you only need this host account. Even if other accounts exist, only UUIDs entered into the private admin table can open the inbox.
6. From the project's **Connect** dialog/API settings, copy its project URL and **publishable** key. The legacy `anon` key also works. Never use a `service_role` key or `sb_secret_...` key in this website.

The host signs in with the account's email identifier and password. Wishes and RSVPs are stored in the inbox; this application sends no emails. Anyone holding a guest's personal link can use that invitation; the host can disable it.

## 2. Upload to GitHub

Upload this package's contents to the root of your repository on the `main` branch. Include the hidden `.github/workflows/pages.yml` directory, `.gitignore`, source files, lockfile and SQL migration. Do not upload `node_modules`, `dist`, `.env`, credentials, or local browser data.

In repository **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your publishable/anon key |

These two values are public frontend configuration. Database permissions protect the data; hiding the public key does not protect it.

## 3. Enable GitHub Pages

1. Open repository **Settings → Pages**.
2. Select **GitHub Actions** as the build/deployment source.
3. Open **Actions → Deploy invitation to GitHub Pages → Run workflow**, and run it on `main` after adding the variables. The first push may fail until these variables and Pages are configured.
4. Wait for the build and deploy jobs to finish. Use the website URL returned by the successful deployment.

For `ZawKhaingLinn/Anna-sbirthday`, the expected URL is `https://zawkhainglinn.github.io/Anna-sbirthday/`. This is an expected address, not confirmation that publication succeeded. GitHub Free supports Pages from public repositories.

## 4. Use and share

1. Open the live URL with `#admin-guests` appended, and sign in as the host.
2. Enter the real name, date, time, venue and photo in **Event details**.
3. Add each guest's name and click **Copy invite link**.
4. Share that personal URL through your preferred messaging app.
5. Guests select their RSVP and write a wish. Read the results in **Wish inbox**, which refreshes every 30 seconds.

Personal links keep the invitation token in the URL fragment. Routes and asset URLs work under a GitHub repository subdirectory without a routing server.

## Local development and checks

Use Node.js 22.13+ (22.12+ supported by Vite; Node 22.13+ recommended).

```sh
npm ci
cp .env.example .env
# Fill the two public Supabase configuration values in .env.
npm test
npm run dev
npm run build
```

The test suite executes the migration in a PostgreSQL-compatible PGlite database, then checks real role permissions and RPC behavior: guest isolation, unauthorized hosts, duplicate/edited responses, validation, disabled invitations and inbox read status. It does not substitute for checking the deployed project and browser behavior. A Supabase plan may impose quotas or pause inactive projects; continued availability also depends on the selected hosting services.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Supabase function security](https://supabase.com/docs/guides/database/functions), [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
