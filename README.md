# TalentIQ: Real-Time Technical Interview Platform

> A full-stack collaborative interview platform where candidates and interviewers join live sessions to code, talk, and chat, all in a single browser tab.

---

## What It Does

TalentIQ lets two people conduct a structured technical interview without needing any external tools. One person creates a session by picking a problem and difficulty; the other joins via a shareable link. Inside the session they get:

- A **Monaco-based code editor** (the same editor VS Code runs on) with syntax highlighting for JavaScript, Python, and Java
- A **live code execution engine** backed by the Piston API — write code, hit Run, see output instantly
- A **video call** powered by Stream, with camera/mic controls built in
- A **real-time chat panel** that slides in alongside the video, also powered by Stream
- A **problem description panel** with examples, constraints, and language-specific starter code

When the host ends the session, it's marked complete, Stream's video call and chat channel are both cleaned up server-side, and both participants are navigated back to their dashboard.

---

## Tech Stack

### Frontend
| Layer | Choice |
|---|---|
| Framework | React 19 + Vite 7 |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| Code editor | Monaco Editor (`@monaco-editor/react`) |
| Video SDK | Stream Video React SDK |
| Chat SDK | Stream Chat React |
| Styling | Tailwind CSS v4 + DaisyUI v5 |
| Auth | Clerk React |
| HTTP | Axios |
| Code execution | Piston API (public, no key required) |

### Backend
| Layer | Choice |
|---|---|
| Runtime | Node.js + Express v5 |
| Database | MongoDB via Mongoose |
| Auth | Clerk Express middleware |
| Video & Chat | Stream Node SDK |
| Background events | Inngest (event-driven functions) |
| Dev server | Nodemon |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Problem Panel │  │  Monaco Editor │  │ Video + Chat │  │
│  │  (description, │  │  + Run Output  │  │ (Stream SDK) │  │
│  │   examples,    │  │  via Piston    │  │              │  │
│  │   constraints) │  │  API           │  │              │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│          ↕ TanStack Query / Axios ↕                         │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │     Express API (Node.js)   │
              │  /api/sessions  /api/chat   │
              │  clerkMiddleware + protectRoute │
              └──────┬──────────┬───────────┘
                     │          │
              ┌──────▼──┐  ┌────▼──────┐
              │ MongoDB  │  │  Stream   │
              │(sessions,│  │(video     │
              │  users)  │  │ + chat)   │
              └──────────┘  └───────────┘
                     │
              ┌──────▼──────────────────┐
              │  Inngest (webhooks)      │
              │  clerk/user.created  →   │
              │  sync user to Mongo +    │
              │  upsert in Stream        │
              │  clerk/user.deleted  →   │
              │  remove from both        │
              └──────────────────────────┘
```

---

## Key Design Decisions

**Event-driven user sync via Inngest** — Instead of syncing Clerk users to MongoDB in a REST endpoint, Inngest functions listen for `clerk/user.created` and `clerk/user.deleted` webhooks. This keeps the auth flow decoupled and makes user sync reliable even under load.

**Single token for video and chat** — The `/api/chat/token` endpoint issues one Stream token that's shared between the `StreamVideoClient` (video) and `StreamChat` (messaging). Both services authenticate with the same identity, so there's no double login.

**Client-side stream singleton** — `lib/stream.js` on the frontend keeps a module-level `client` reference and reuses it across re-renders, only reconnecting when the user changes. This avoids redundant WebSocket connections.

**Polling for session status** — `useSessionById` refetches every 5 seconds. When a host ends a session, the participant's client detects `status === "completed"` on the next poll and auto-navigates to the dashboard — no WebSocket infrastructure needed on the backend.

**Resizable panel layout** — The session page uses `react-resizable-panels` for a draggable split between problem/code on the left and video/chat on the right. Each region can be resized independently, letting participants adjust the workspace to their preference.

---

## Project Structure

```
talent-IQ/
├── backend/
│   └── src/
│       ├── controllers/
│       │   ├── sessionController.js   # create, join, end, list sessions
│       │   └── chatController.js      # issue Stream tokens
│       ├── lib/
│       │   ├── db.js                  # MongoDB connection
│       │   ├── env.js                 # validated env vars
│       │   ├── inngest.js             # syncUser + deleteUser functions
│       │   └── stream.js              # Stream Chat + Video clients
│       ├── middleware/
│       │   └── protectRoute.js        # Clerk JWT → MongoDB user lookup
│       ├── models/
│       │   ├── Session.js             # problem, difficulty, host, participant, callId
│       │   └── User.js                # clerkId, name, email, profileImage
│       ├── routes/
│       │   ├── sessionRoute.js
│       │   └── chatRoutes.js
│       └── server.js
├── frontend/
│   └── src/
│       ├── api/sessions.js            # Axios API layer
│       ├── components/                # CodeEditorPanel, VideoCallUI, Navbar, ...
│       ├── data/problems.js           # 5 curated problems with multi-lang starter code
│       ├── hooks/
│       │   ├── useSessions.js         # TanStack Query wrappers
│       │   └── useStreamClient.js     # video + chat init/cleanup hook
│       ├── lib/
│       │   ├── axios.js               # Axios instance with base URL
│       │   ├── piston.js              # Piston API wrapper
│       │   └── stream.js              # StreamVideoClient singleton
│       └── pages/
│           ├── HomePage.jsx
│           ├── DashboardPage.jsx
│           ├── ProblemsPage.jsx
│           ├── ProblemPage.jsx
│           └── SessionPage.jsx        # main interview workspace
└── package.json                       # root-level dev scripts
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster (free tier works fine)
- A [Clerk](https://clerk.dev) application
- A [Stream](https://getstream.io) application with Chat and Video products enabled
- An [Inngest](https://www.inngest.com) account (free tier) for webhook handling

### 1. Clone & install

```bash
git clone <your-repo-url>
cd talent-IQ

# install root scripts
npm install

# install backend
cd backend && npm install

# install frontend
cd ../frontend && npm install
```

### 2. Configure environment variables

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:

```env
PORT=3000
NODE_ENV=development

DB_URL=your_mongodb_connection_url

INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret

CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

CLIENT_URL=http://localhost:5173
```

**Frontend** — copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_STREAM_API_KEY=your_stream_api_key
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### 3. Set up Clerk webhooks

In your Clerk dashboard, add a webhook pointing to:
```
https://<your-ngrok-or-deployed-url>/api/inngest
```
Enable the `user.created` and `user.deleted` events.

Then start the Inngest dev server to receive those events locally:
```bash
npx inngest-cli@latest dev
```

### 4. Run the app

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3000`.

---

## REST API Reference

All routes require a valid Clerk session token in the `Authorization` header.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/active` | List all active sessions (up to 20) |
| `GET` | `/api/sessions/my-recent` | List the authenticated user's completed sessions |
| `GET` | `/api/sessions/:id` | Get a session by ID |
| `POST` | `/api/sessions/:id/join` | Join a session as participant |
| `POST` | `/api/sessions/:id/end` | End a session (host only) |
| `GET` | `/api/chat/token` | Get a Stream auth token |
| `GET` | `/health` | Health check |

---

## Supported Languages & Problems

**Languages**: JavaScript (Node 18.15), Python (3.10), Java (15.0.2)

**Problem set**:

| Problem | Difficulty | Category |
|---|---|---|
| Two Sum | Easy | Array · Hash Table |
| Reverse String | Easy | String · Two Pointers |
| Valid Palindrome | Easy | String · Two Pointers |
| Maximum Subarray | Medium | Array · Dynamic Programming |
| Container With Most Water | Medium | Array · Two Pointers |

Each problem ships with per-language starter code, sample inputs, expected outputs, and constraints.

---

## Testing

See [`TESTING.md`](./TESTING_AND_RESUME.md) for the full testing guide (manual + automated).

---

## Production Build

```bash
cd frontend && npm run build
# built files go to frontend/dist/

cd ../backend && npm start
# in production, Express serves the dist/ folder as static files
```

---

## License

MIT

