import express from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true },
        },
});

const PORT = Number(process.env.PORT || 3000);
const DATA_PATH =
  process.env.DATA_PATH || path.join(__dirname, "..", "data", "messages.json");
const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MAX_MESSAGE_LENGTH = 500;
const MAX_MOOD_ID_LENGTH = 80;
const MAX_EMOJI_LENGTH = 32;
const MAX_COLOR_LENGTH = 40;
const MAX_HISTORY_ITEMS = 50;

app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

function ensureDataDir() {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
}

function loadDB() {
  ensureDataDir();

  try {
    if (fs.existsSync(DATA_PATH)) {
      const db = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      return Array.isArray(db.messages) ? db : { messages: [] };
    }
  } catch (error) {
    logger.warn({ error, dataPath: DATA_PATH }, "Could not read message store");
  }

  return { messages: [] };
}

function saveDB(db) {
  ensureDataDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

function sendTemplate(res, fileName) {
  const filePath = path.join(TEMPLATE_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    res.status(404).send("Not Found");
    return;
  }

  const html = fs
    .readFileSync(filePath, "utf8")
    .replaceAll(
      "ONESIGNAL_APP_ID_PLACEHOLDER",
      process.env.ONESIGNAL_APP_ID ?? "",
    );

  res.type("html").send(html);
}

async function notifyReceiver({ emoji, message, appUrl }) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey =
    process.env.ONESIGNAL_API_KEY ?? process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    logger.warn("OneSignal env vars not set; skipping push notification");
    return;
  }

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ["Total Subscriptions"],
        headings: {
          en: `${emoji || "💌"} Delband sent you a mood`,
        },
        contents: {
          en: message || "Open Naztify to see it 💕",
        },
        url: `${appUrl}/receiver`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn({ data, status: response.status }, "OneSignal push failed");
      return;
    }

    logger.info({ data }, "OneSignal notification sent");
  } catch (error) {
    logger.error({ error }, "Failed to send OneSignal notification");
  }
}

function sendManifest(res, { startUrl, name, shortName }) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    res.status(404).send("Not Found");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  manifest.start_url = startUrl;
  manifest.name = name;
  manifest.short_name = shortName;
  res.type("application/manifest+json").send(JSON.stringify(manifest));
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function buildMessageEntry(body) {
  const message = sanitizeText(body.message, MAX_MESSAGE_LENGTH);

  if (!message) {
    return {
      error: "Message is required.",
      status: 400,
    };
  }

  return {
    entry: {
      id: Date.now().toString(),
      moodId: sanitizeText(body.moodId, MAX_MOOD_ID_LENGTH),
      message,
      emoji: sanitizeText(body.emoji, MAX_EMOJI_LENGTH),
      color: sanitizeText(body.color, MAX_COLOR_LENGTH),
      sentAt: Date.now(),
      reply: null,
      replyEmoji: null,
      replyAt: null,
    },
  };
}

app.get("/", (_req, res) => sendTemplate(res, "landing-page.html"));
app.get("/for-her", (_req, res) => res.redirect("/receiver"));
app.get("/for-you", (_req, res) => res.redirect("/sender"));
app.get("/sender", (_req, res) => sendTemplate(res, "dashboard.html"));
app.get("/dashboard", (_req, res) => sendTemplate(res, "dashboard.html"));
app.get("/receiver", (_req, res) => sendTemplate(res, "her.html"));
app.get("/her", (_req, res) => sendTemplate(res, "her.html"));

app.get("/manifest.json", (_req, res) => {
  if (!fs.existsSync(MANIFEST_PATH)) {
    res.status(404).send("Not Found");
    return;
  }

  res.type("application/manifest+json").sendFile(MANIFEST_PATH);
});

app.get("/receiver-manifest.json", (_req, res) => {
  sendManifest(res, {
    startUrl: "/receiver",
    name: "Naztify Receiver",
    shortName: "Naztify",
  });
});

app.get("/sender-manifest.json", (_req, res) => {
  sendManifest(res, {
    startUrl: "/sender",
    name: "Naztify Sender",
    shortName: "Naztify",
  });
});

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/send", async (req, res) => {
  const { entry, error, status } = buildMessageEntry(req.body);

  if (error) {
    res.status(status).json({ success: false, error });
    return;
  }

  const db = loadDB();

  db.messages.unshift(entry);

  if (db.messages.length > MAX_HISTORY_ITEMS) {
    db.messages = db.messages.slice(0, MAX_HISTORY_ITEMS);
  }

  saveDB(db);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  await notifyReceiver({ emoji: entry.emoji, message: entry.message, appUrl });
  res.json({ success: true, entry });
});

app.post("/api/reply", (req, res) => {
  const { messageId, reply, replyEmoji } = req.body;
  const db = loadDB();
  const message = db.messages.find((item) => item.id === messageId);

  if (!message) {
    res.status(404).json({ success: false, error: "Message not found." });
    return;
  }

  message.reply = sanitizeText(reply, MAX_MESSAGE_LENGTH);
  message.replyEmoji = sanitizeText(replyEmoji, MAX_EMOJI_LENGTH);
  message.replyAt = Date.now();
  saveDB(db);

  res.json({ success: true, message });
});

app.get("/api/latest", (_req, res) => {
  const db = loadDB();
  res.json({ message: db.messages[0] || null });
});

app.get("/api/status", (_req, res) => {
  const db = loadDB();
  res.json({ latest: db.messages[0] || null });
});

function startServer() {
  return app.listen(PORT, () => {
    logger.info({ port: PORT }, "Naztify server listening");
  });
}

if (process.argv[1] === __filename) {
  startServer();
}

export { app, buildMessageEntry, loadDB, saveDB, startServer };
