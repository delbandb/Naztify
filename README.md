# Naztify

[![CI](https://github.com/delbandb/Naztify/actions/workflows/ci.yml/badge.svg)](https://github.com/delbandb/Naztify/actions/workflows/ci.yml)

Naztify is a private real-time mood messenger for two people. It is a small personal web app built with Node.js and Express that lets one person send a mood, message, color, and emoji to a receiver page, with optional OneSignal push notifications for iPhone home-screen usage.

The app is intentionally personal, but the project still demonstrates useful product skills: routing, server-rendered pages, simple persistence, push-notification integration, deployment configuration, and mobile web-app behavior.

## Recruiter Quick Scan

- Built a deployable Node.js and Express app with server-rendered pages and JSON API endpoints.
- Added input validation, API tests, and GitHub Actions CI for a more production-minded workflow.
- Integrated optional OneSignal web push behavior and PWA-style manifests for mobile usage.
- Kept the scope small but complete: routing, persistence, templates, deployment config, tests, and documentation.

## What It Does

- Serves a landing page, sender dashboard, and receiver page.
- Stores the latest mood messages in a local JSON file.
- Keeps the message history capped so the data file stays small.
- Sends optional push notifications through OneSignal.
- Provides separate web-app manifests for sender and receiver flows.
- Exposes small JSON endpoints for health checks, latest message, and status.
- Includes Render deployment configuration.

## Tech Stack

| Area | Tools |
| --- | --- |
| Runtime | Node.js 20+ |
| Server | Express |
| Logging | pino, pino-http |
| Styling/UI | HTML templates, CSS, client-side JavaScript |
| Notifications | OneSignal Web Push |
| Persistence | JSON file storage |
| Deployment | Render |

## Routes and API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Landing page |
| GET | `/sender` | Sender dashboard |
| GET | `/receiver` | Receiver page |
| GET | `/for-you` | Redirect to sender flow |
| GET | `/for-her` | Redirect to receiver flow |
| GET | `/manifest.json` | Default PWA manifest |
| GET | `/sender-manifest.json` | Sender-specific manifest |
| GET | `/receiver-manifest.json` | Receiver-specific manifest |
| GET | `/api/healthz` | Health check |
| POST | `/api/send` | Save and send a mood message |
| POST | `/api/reply` | Save a reply to a message |
| GET | `/api/latest` | Return the latest message |
| GET | `/api/status` | Return the latest status payload |

## Project Structure

```text
Naztify/
|-- public/
|   `-- OneSignalSDKWorker.js
|-- src/
|   `-- index.js              # Express app, routes, storage, notifications
|-- templates/
|   |-- landing-page.html
|   |-- dashboard.html         # Sender view
|   `-- her.html               # Receiver view
|-- data/                      # Local JSON message storage at runtime
|-- manifest.json
|-- render.yaml
|-- package.json
|-- .env.example
`-- README.md
```

## Run Locally

```bash
npm install
npm run dev
```

Or run the production-style command:

```bash
npm start
```

The app defaults to:

```text
http://localhost:3000
```

Run the API test suite with:

```bash
npm test
```

## Environment Variables

Create a `.env` file based on `.env.example` if you want push notifications:

```env
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_API_KEY=your-onesignal-rest-api-key
APP_URL=https://your-app.onrender.com
```

If OneSignal variables are missing, the app still works locally and simply skips push notification delivery.

## Deploy on Render

Render can use the included `render.yaml`. Manual settings are:

```text
Build command: npm install
Start command: npm start
```

Add the same environment variables from `.env.example` in the Render dashboard.

## iPhone Web Push Notes

For iPhone web push, the receiver needs to:

- Open the deployed site in Safari.
- Add it to the Home Screen.
- Open Naztify from the Home Screen icon.
- Tap the notifications button once to subscribe.

## Privacy Note

This is a personal project and the UI is customized for a private use case. The public repository should be treated as a technical demo of the app structure and workflow, not as a generic messaging product.

## What I Would Improve Next

- Move message storage from JSON files to SQLite or PostgreSQL.
- Add authentication for the sender and receiver flows.
- Add tests for the API endpoints.
- Add rate limiting and stronger input validation.
- Add a small admin/debug page for notification delivery status.
