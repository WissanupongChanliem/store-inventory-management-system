import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  createApiErrorReporter,
  createTestApp,
  expectSessionCookieCleared,
  expectSuccess,
  loginAsOwner,
  resetTestData,
  sendMalformedJson,
  setCookiePair,
  TEST_OWNER,
  type TestContext,
} from "./test-app";

const protectedAuthProbes = [
  { method: "get", path: "/api/auth/me" },
  {
    method: "patch",
    path: "/api/auth/me",
    body: { currentPassword: TEST_OWNER.password, newUsername: "owner-next" },
  },
] as const;

describe("Authentication endpoints", () => {
  let context: TestContext;
  const expectApiError = createApiErrorReporter(() => context);

  beforeAll(() => {
    context = createTestApp();
  });

  beforeEach(() => {
    resetTestData(context);
  });

  afterAll(() => {
    context.closeDatabase();
  });

  it("LOGIN-1 logs in with an opaque HttpOnly session cookie", async () => {
    const response = await request(context.app)
      .post("/api/auth/login")
      .send(TEST_OWNER);

    expectSuccess(response, 200);
    expect(response.body.user).toMatchObject({
      id: context.ownerId,
      username: TEST_OWNER.username,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);

    const cookie = response.headers["set-cookie"]?.[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
    expect(cookie).not.toContain(TEST_OWNER.username);
    expect(cookie).not.toContain(TEST_OWNER.password);
    expect(cookie).not.toMatch(/^\s*sid=\{.*\}/);
    const token = cookie?.slice("sid=".length).split(";")[0];
    expect(token?.length).toBeGreaterThanOrEqual(32);
    expect(token?.split(".")).toHaveLength(1);
    expect(() => JSON.parse(token ?? "")).toThrow();
  });

  it("LOGIN-1 marks the session cookie Secure for an HTTPS request", async () => {
    const previousTrustProxy = context.app.get("trust proxy");
    context.app.set("trust proxy", true);
    try {
      const response = await request(context.app)
        .post("/api/auth/login")
        .set("X-Forwarded-Proto", "https")
        .send(TEST_OWNER);

      expect(response.status).toBe(200);
      const cookie = response.headers["set-cookie"]?.[0];
      expect(cookie).toMatch(/;\s*Secure(?:;|$)/i);
    } finally {
      context.app.set("trust proxy", previousTrustProxy);
    }
  });

  it("LOGIN-2 uses the login cookie to read the owner account", async () => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/auth/me");

    expectSuccess(response, 200);
    expect(response.body.user).toEqual({
      id: context.ownerId,
      username: TEST_OWNER.username,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
  });

  it("LOGIN-3 and LOGIN-4 return the same error for invalid credentials and unknown users", async () => {
    const invalidPassword = await request(context.app)
      .post("/api/auth/login")
      .send({ username: TEST_OWNER.username, password: "incorrect password" });
    const invalidUsername = await request(context.app)
      .post("/api/auth/login")
      .send({ username: "not-an-owner", password: TEST_OWNER.password });

    expectApiError(invalidPassword, 401, "INVALID_CREDENTIALS", {
      username: TEST_OWNER.username,
      password: "incorrect password",
    });
    expectApiError(invalidUsername, 401, "INVALID_CREDENTIALS", {
      username: "not-an-owner",
      password: TEST_OWNER.password,
    });
    expect(invalidUsername.body.error.message).toBe(
      invalidPassword.body.error.message,
    );
    expect(invalidPassword.headers["set-cookie"]).toBeUndefined();
    expect(invalidUsername.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["missing both credentials", {}, ["username", "password"]],
    ["missing username", { password: TEST_OWNER.password }, ["username"]],
    ["missing password", { username: TEST_OWNER.username }, ["password"]],
    [
      "non-string username",
      { username: 42, password: TEST_OWNER.password },
      ["username"],
    ],
    [
      "non-string password",
      { username: TEST_OWNER.username, password: 42 },
      ["password"],
    ],
  ])("LOGIN-5 rejects %s", async (_caseName, body, fields) => {
    const response = await request(context.app).post("/api/auth/login").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining(
        fields.map((field) => expect.objectContaining({ field })),
      ),
    );
  });

  it("rejects unknown login fields without authenticating", async () => {
    const body = {
      ...TEST_OWNER,
      isAdmin: true,
    };
    const response = await request(context.app).post("/api/auth/login").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
  });

  it.each([
    ["without a cookie", undefined],
    ["with a forged cookie", "sid=not-a-valid-session"],
  ])("G1 rejects GET /api/auth/me %s", async (_caseName, cookie) => {
    const apiRequest = request(context.app).get("/api/auth/me");
    const response = await (cookie ? apiRequest.set("Cookie", cookie) : apiRequest);

    expectApiError(response, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: cookie ? "forged" : "missing",
    });
  });

  it("G1 rejects an expired session", async () => {
    const { agent } = await loginAsOwner(context.app);
    context.db.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2000-01-01T00:00:00.000Z");
    const response = await agent.get("/api/auth/me");

    expectApiError(response, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      session: "expired",
    });
  });

  it.each([
    ["without a cookie", undefined],
    ["with a forged cookie", "sid=not-a-valid-session"],
  ])("G1 rejects PATCH /api/auth/me %s", async (_caseName, cookie) => {
    const body = {
      currentPassword: TEST_OWNER.password,
      newUsername: "owner-next",
    };
    const apiRequest = request(context.app).patch("/api/auth/me").send(body);
    const response = await (cookie ? apiRequest.set("Cookie", cookie) : apiRequest);

    expectApiError(response, 401, "UNAUTHENTICATED", {
      method: "PATCH",
      path: "/api/auth/me",
      body,
      cookie: cookie ? "forged" : "missing",
    });
  });

  it.each([
    ["GET", "/api/auth/me", "get"],
    ["POST", "/api/auth/login", "post"],
    ["PATCH", "/api/auth/me", "patch"],
    ["POST", "/api/auth/logout", "post"],
  ] as const)("G3 rejects malformed JSON on %s %s", async (_method, path, method) => {
    const response = await sendMalformedJson(context.app, method, path);
    expectApiError(response, 400, "BAD_REQUEST", {
      method,
      path,
      body: '{"malformed":',
    });
  });

  it("LOGOUT-1 and LOGOUT-2 revoke the session and clear its cookie", async () => {
    const { agent, response: loginResponse } = await loginAsOwner(context.app);
    const originalCookie = setCookiePair(loginResponse);
    const logoutResponse = await agent.post("/api/auth/logout");

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.text).toBe("");
    expectSessionCookieCleared(logoutResponse);

    const currentSessionResponse = await agent.get("/api/auth/me");
    const replayedCookieResponse = await request(context.app)
      .get("/api/auth/me")
      .set("Cookie", originalCookie);
    const replayedPatchResponse = await request(context.app)
      .patch("/api/auth/me")
      .set("Cookie", originalCookie)
      .send({
        currentPassword: TEST_OWNER.password,
        newUsername: "owner-next",
      });

    expectApiError(currentSessionResponse, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: "revoked",
    });
    expectApiError(replayedCookieResponse, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: "revoked",
    });
    expectApiError(replayedPatchResponse, 401, "UNAUTHENTICATED", {
      method: "PATCH",
      path: "/api/auth/me",
      cookie: "revoked",
      body: {
        currentPassword: TEST_OWNER.password,
        newUsername: "owner-next",
      },
    });
  });

  it("LOGOUT-3 allows logout without a session, including repeated calls", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(context.app).post("/api/auth/logout");
      expect(response.status).toBe(204);
      expect(response.text).toBe("");
    }
  });

  it("ACCOUNT-1 changes only the username and requires a fresh login", async () => {
    const { agent, response: loginResponse } = await loginAsOwner(context.app);
    const originalCookie = setCookiePair(loginResponse);
    const response = await agent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newUsername: "  owner-next  ",
    });

    expectSuccess(response, 200);
    expect(response.body.user).toEqual({
      id: context.ownerId,
      username: "owner-next",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
    expectSessionCookieCleared(response);

    const replayedSession = await request(context.app)
      .get("/api/auth/me")
      .set("Cookie", originalCookie);
    expectApiError(replayedSession, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: "revoked",
    });

    const newLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: "owner-next", password: TEST_OWNER.password });
    expect(newLogin.status).toBe(200);
  });

  it("ACCOUNT-2 changes only the password; the old password stops working", async () => {
    const newPassword = "A new valid owner password 123";
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newPassword,
    });

    expect(response.status).toBe(200);
    expectSessionCookieCleared(response);
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);

    const oldPasswordLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: TEST_OWNER.username, password: TEST_OWNER.password });
    const newPasswordLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: TEST_OWNER.username, password: newPassword });
    expectApiError(oldPasswordLogin, 401, "INVALID_CREDENTIALS", {
      username: TEST_OWNER.username,
      password: TEST_OWNER.password,
    });
    expect(newPasswordLogin.status).toBe(200);
  });

  it("ACCOUNT-3 changes username and password together", async () => {
    const newUsername = "new-owner";
    const newPassword = "Another valid password 123";
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newUsername,
      newPassword,
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: context.ownerId,
      username: newUsername,
    });
    expectSessionCookieCleared(response);

    const newLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: newUsername, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  it("ACCOUNT-4 rejects an incorrect current password without changing the account", async () => {
    const { agent } = await loginAsOwner(context.app);
    const body = {
      currentPassword: "incorrect current password",
      newUsername: "owner-compromised",
      newPassword: "A new valid owner password 123",
    };
    const response = await agent.patch("/api/auth/me").send(body);

    expectApiError(response, 401, "INVALID_CREDENTIALS", body);
    const currentLogin = await request(context.app)
      .post("/api/auth/login")
      .send(TEST_OWNER);
    expect(currentLogin.status).toBe(200);
    const changedLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: "owner-compromised", password: "A new valid owner password 123" });
    expectApiError(changedLogin, 401, "INVALID_CREDENTIALS", {
      username: "owner-compromised",
      password: "A new valid owner password 123",
    });
  });

  it.each([
    ["missing currentPassword", { newUsername: "owner-next" }, "currentPassword"],
    ["no new account fields", { currentPassword: TEST_OWNER.password }, undefined],
    ["empty body", {}, "currentPassword"],
  ])("ACCOUNT-5 rejects %s", async (_caseName, body, field) => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch("/api/auth/me").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    if (field) {
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    }
  });

  it.each([
    ["empty username", { newUsername: "" }, "newUsername"],
    ["whitespace username", { newUsername: "   " }, "newUsername"],
    ["username longer than 100 characters", { newUsername: "u".repeat(101) }, "newUsername"],
    ["non-string username", { newUsername: 12 }, "newUsername"],
    ["password shorter than 12 characters", { newPassword: "12345678901" }, "newPassword"],
    ["password longer than 128 characters", { newPassword: "p".repeat(129) }, "newPassword"],
    ["non-string password", { newPassword: 12 }, "newPassword"],
  ])("ACCOUNT-6 rejects %s", async (_caseName, changedField, expectedField) => {
    const { agent } = await loginAsOwner(context.app);
    const body = {
      currentPassword: TEST_OWNER.password,
      ...changedField,
    };
    const response = await agent.patch("/api/auth/me").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: expectedField }),
      ]),
    );
  });

  it("ACCOUNT-6 accepts one-character and 100-character usernames and 12/128-character passwords", async () => {
    const { agent } = await loginAsOwner(context.app);
    const minimumNameUpdate = await agent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newUsername: "x",
    });
    expect(minimumNameUpdate.status).toBe(200);
    const minimumNameAgent = request.agent(context.app);
    const minimumNameLogin = await minimumNameAgent
      .post("/api/auth/login")
      .send({ username: "x", password: TEST_OWNER.password });
    expect(minimumNameLogin.status).toBe(200);

    const maximumName = "u".repeat(100);
    const usernameUpdate = await minimumNameAgent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newUsername: maximumName,
    });
    expect(usernameUpdate.status).toBe(200);
    expect(usernameUpdate.body.user.username).toBe(maximumName);

    const nameLoginAgent = request.agent(context.app);
    const nameLogin = await nameLoginAgent
      .post("/api/auth/login")
      .send({ username: maximumName, password: TEST_OWNER.password });
    expect(nameLogin.status).toBe(200);
    const twelveCharacterPassword = "p".repeat(12);
    const minimumPasswordUpdate = await nameLoginAgent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newPassword: twelveCharacterPassword,
    });
    expect(minimumPasswordUpdate.status).toBe(200);

    const minimumPasswordAgent = request.agent(context.app);
    const minimumPasswordLogin = await minimumPasswordAgent
      .post("/api/auth/login")
      .send({ username: maximumName, password: twelveCharacterPassword });
    expect(minimumPasswordLogin.status).toBe(200);
    const maximumPassword = "p".repeat(128);
    const maximumPasswordUpdate = await minimumPasswordAgent
      .patch("/api/auth/me")
      .send({
        currentPassword: twelveCharacterPassword,
        newPassword: maximumPassword,
      });
    expect(maximumPasswordUpdate.status).toBe(200);
  });

  it("ACCOUNT-7 rejects unknown fields without changing the account", async () => {
    const { agent } = await loginAsOwner(context.app);
    const body = {
      currentPassword: TEST_OWNER.password,
      newUsername: "changed-owner",
      isAdmin: true,
    };
    const response = await agent.patch("/api/auth/me").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    const login = await request(context.app).post("/api/auth/login").send(TEST_OWNER);
    expect(login.status).toBe(200);
    const changedLogin = await request(context.app)
      .post("/api/auth/login")
      .send({ username: "changed-owner", password: TEST_OWNER.password });
    expectApiError(changedLogin, 401, "INVALID_CREDENTIALS", {
      username: "changed-owner",
      password: TEST_OWNER.password,
    });
  });

  it("ACCOUNT-8 invalidates the old session after a successful account change", async () => {
    const { agent, response: loginResponse } = await loginAsOwner(context.app);
    const oldCookie = setCookiePair(loginResponse);
    const secondSession = await request.agent(context.app);
    const secondLogin = await secondSession
      .post("/api/auth/login")
      .send(TEST_OWNER);
    expect(secondLogin.status).toBe(200);
    const secondCookie = setCookiePair(secondLogin);
    const updateResponse = await agent.patch("/api/auth/me").send({
      currentPassword: TEST_OWNER.password,
      newUsername: "owner-after-change",
    });

    expect(updateResponse.status).toBe(200);
    const response = await request(context.app)
      .get("/api/auth/me")
      .set("Cookie", oldCookie);
    expectApiError(response, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: "revoked",
    });
    const secondSessionResponse = await request(context.app)
      .get("/api/auth/me")
      .set("Cookie", secondCookie);
    expectApiError(secondSessionResponse, 401, "UNAUTHENTICATED", {
      method: "GET",
      path: "/api/auth/me",
      cookie: "revoked",
    });
  });
});
