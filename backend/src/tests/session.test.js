import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ─── Mocks (must be hoisted before any imports that use them) ───────────────

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  requireAuth: () => (req, res, next) => {
    req.auth = () => ({ userId: "test_clerk_id" });
    next();
  },
}));

vi.mock("../middleware/protectRoute.js", () => ({
  protectRoute: [
    (req, res, next) => {
      req.user = { _id: "mongo_user_id", clerkId: "test_clerk_id" };
      next();
    },
  ],
}));

vi.mock("../lib/stream.js", () => ({
  chatClient: {
    channel: () => ({
      create: vi.fn().mockResolvedValue({}),
      addMembers: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    }),
    createToken: () => "mock_token",
  },
  streamClient: {
    video: {
      call: () => ({
        getOrCreate: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      }),
    },
  },
}));

const mockSession = {
  _id: "session_123",
  problem: "Two Sum",
  difficulty: "easy",
  status: "active",
  callId: "call_abc",
  host: { toString: () => "mongo_user_id" },
  participant: null,
  save: vi.fn().mockResolvedValue({}),
};

vi.mock("../models/Session.js", () => {
  const Session = {
    create: vi.fn(),
    find: vi.fn(() => ({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    })),
    findById: vi.fn(),
    init: vi.fn().mockResolvedValue({}),
  };
  return { default: Session };
});

// ─── App setup ──────────────────────────────────────────────────────────────

import sessionRoutes from "../routes/sessionRoute.js";
import Session from "../models/Session.js";

const app = express();
app.use(express.json());
app.use("/api/sessions", sessionRoutes);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/sessions — createSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when problem is missing", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({ difficulty: "easy" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Problem and difficulty are required");
  });

  it("returns 400 when difficulty is missing", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({ problem: "Two Sum" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Problem and difficulty are required");
  });

  it("returns 201 with valid body", async () => {
    Session.create.mockResolvedValue({ ...mockSession, _id: { toString: () => "session_123" } });
    const res = await request(app)
      .post("/api/sessions")
      .send({ problem: "Two Sum", difficulty: "easy" });
    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
  });
});

describe("GET /api/sessions/active — getActiveSessions", () => {
  it("returns 200 with a sessions array", async () => {
    const res = await request(app).get("/api/sessions/active");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

describe("POST /api/sessions/:id/join — joinSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when session does not exist", async () => {
    Session.findById.mockResolvedValue(null);
    const res = await request(app).post("/api/sessions/bad_id/join");
    expect(res.status).toBe(404);
  });

  it("returns 400 when session is already completed", async () => {
    Session.findById.mockResolvedValue({ ...mockSession, status: "completed" });
    const res = await request(app).post("/api/sessions/session_123/join");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Cannot join a completed session");
  });

  it("returns 400 when host tries to join their own session", async () => {
    Session.findById.mockResolvedValue({ ...mockSession });
    const res = await request(app).post("/api/sessions/session_123/join");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Host cannot join");
  });

  it("returns 409 when session already has a participant", async () => {
    Session.findById.mockResolvedValue({
      ...mockSession,
      host: { toString: () => "someone_else" },
      participant: "already_there",
    });
    const res = await request(app).post("/api/sessions/session_123/join");
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Session is full");
  });
});

describe("POST /api/sessions/:id/end — endSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when session does not exist", async () => {
    Session.findById.mockResolvedValue(null);
    const res = await request(app).post("/api/sessions/bad_id/end");
    expect(res.status).toBe(404);
  });

  it("returns 403 when a non-host tries to end the session", async () => {
    Session.findById.mockResolvedValue({
      ...mockSession,
      host: { toString: () => "someone_else" },
    });
    const res = await request(app).post("/api/sessions/session_123/end");
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Only the host");
  });

  it("returns 400 when session is already completed", async () => {
    Session.findById.mockResolvedValue({
      ...mockSession,
      status: "completed",
    });
    const res = await request(app).post("/api/sessions/session_123/end");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already completed");
  });
});

describe("GET /api/sessions/:id — getSessionById", () => {
  it("returns 404 when session does not exist", async () => {
    const mockQuery = {
      populate: vi.fn().mockReturnThis(),
      then: (resolve) => resolve(null),
    };
    Session.findById.mockReturnValue(mockQuery);
    const res = await request(app).get("/api/sessions/bad_id");
    expect(res.status).toBe(404);
  });

  it("returns 200 with session when found", async () => {
    const mockQuery = {
      populate: vi.fn().mockReturnThis(),
      then: (resolve) => resolve(mockSession),
    };
    Session.findById.mockReturnValue(mockQuery);
    const res = await request(app).get("/api/sessions/session_123");
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
  });
});

