import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "naztify-test-"));
process.env.DATA_PATH = path.join(tempDir, "messages.json");
process.env.LOG_LEVEL = "silent";

const { app } = await import(`../src/index.js?test=${Date.now()}`);

function listen() {
  const server = app.listen(0);
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function postJson(baseUrl, route, body) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("send endpoint stores a trimmed message and exposes it as latest", async () => {
  const server = listen();

  try {
    const response = await postJson(server.baseUrl, "/api/send", {
      moodId: " calm ",
      message: "  Thinking of you  ",
      emoji: " :) ",
      color: " #ff7ab6 ",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.entry.message, "Thinking of you");
    assert.equal(payload.entry.moodId, "calm");

    const latestResponse = await fetch(`${server.baseUrl}/api/latest`);
    const latestPayload = await latestResponse.json();
    assert.equal(latestPayload.message.message, "Thinking of you");
  } finally {
    await server.close();
  }
});

test("send endpoint rejects empty messages", async () => {
  const server = listen();

  try {
    const response = await postJson(server.baseUrl, "/api/send", {
      message: "   ",
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.match(payload.error, /required/i);
  } finally {
    await server.close();
  }
});

test("reply endpoint updates an existing message and rejects missing ids", async () => {
  const server = listen();

  try {
    const sendResponse = await postJson(server.baseUrl, "/api/send", {
      message: "Hello",
    });
    const { entry } = await sendResponse.json();

    const replyResponse = await postJson(server.baseUrl, "/api/reply", {
      messageId: entry.id,
      reply: "  Received  ",
      replyEmoji: " <3 ",
    });
    const replyPayload = await replyResponse.json();

    assert.equal(replyResponse.status, 200);
    assert.equal(replyPayload.message.reply, "Received");
    assert.equal(replyPayload.message.replyEmoji, "<3");

    const missingResponse = await postJson(server.baseUrl, "/api/reply", {
      messageId: "missing",
      reply: "Nope",
    });

    assert.equal(missingResponse.status, 404);
  } finally {
    await server.close();
  }
});
