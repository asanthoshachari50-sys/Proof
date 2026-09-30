# Proof

Proof helps student builders turn project claims into evidence. A user creates an account, adds a public GitHub profile, defends a chosen repository with four written prompts, receives a score, and can print a shareable proof certificate.

## Included

- A responsive landing page and authentication dialog at `/`.
- A protected builder dashboard at `/dashboard.html`.
- Email/password registration and sign-in using Node's `scrypt` password hashing.
- Signed seven-day bearer sessions using HMAC SHA-256.
- GitHub profile URL validation, a structured defense round, persisted assessments, and a printable certificate.
- An optional GitHub OAuth authorization entry point, controlled by environment variables.

## Run locally

```bash
cp .env.example .env # optional; edit the variables for your setup
npm start
```

Open [http://localhost:3000](http://localhost:3000). Node.js 18 or later is required. The app uses built-in Node modules only, so there is no dependency install step.

## Environment

Copy these into `.env` (or export them in your host). Always set a long, random `SESSION_SECRET` in production.

```dotenv
PORT=3000
SESSION_SECRET=replace-with-a-long-random-secret
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
```

GitHub OAuth’s authorization route is available at `/api/auth/github`; configure the callback URL in your GitHub OAuth App before enabling it. The callback intentionally returns a setup notice until the production token exchange and account-linking policy are completed—do not treat it as production-ready OAuth.

## Data and security notes

Development users and assessments are stored in `data/proof.json`, which is ignored by Git. Passwords are salted and hashed with `crypto.scrypt`; plaintext passwords are never stored. For production, replace the JSON file with a transactional database, rotate `SESSION_SECRET`, add HTTPS/cookie or refresh-token protections, rate limiting, email verification, CSRF protection for browser auth, validation auditing, and finish the OAuth callback exchange.

## API overview

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an email/password account |
| `POST` | `/api/auth/login` | Sign in and receive a session token |
| `GET` | `/api/me` | Fetch the signed-in builder |
| `PATCH` | `/api/profile/github` | Save a public GitHub profile URL |
| `POST` | `/api/assessments` | Submit a repository defense |
| `GET` | `/api/assessments/latest` | Retrieve the latest certificate |

## Project structure

```text
server.js              HTTP API, auth, persistence, and static file serving
public/index.html      Landing experience
public/dashboard.*     Authenticated dashboard, assessment, certificate
data/.gitkeep          Keeps the local-data directory in Git
```
