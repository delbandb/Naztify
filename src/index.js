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
const DATA_PATH = path.join(__dirname, "..", "data", "messages.json");
const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

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
      return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    }
  } catch {}

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

app.get("/", (_req, res) => sendTemplate(res, "landing-page.html"));
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

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/send", async (req, res) => {
  const { moodId, message, emoji, color } = req.body;
  const db = loadDB();
  const entry = {
    id: Date.now().toString(),
    moodId,
    message,
    emoji,
    color,
    sentAt: Date.now(),
    reply: null,
    replyEmoji: null,
    replyAt: null,
  };

  db.messages.unshift(entry);

  if (db.messages.length > 50) {
    db.messages = db.messages.slice(0, 50);
  }

  saveDB(db);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  await notifyReceiver({ emoji, message, appUrl });
  res.json({ success: true, entry });
});

app.post("/api/reply", (req, res) => {
  const { messageId, reply, replyEmoji } = req.body;
  const db = loadDB();
  const message = db.messages.find((item) => item.id === messageId);

  if (message) {
    message.reply = reply;
    message.replyEmoji = replyEmoji;
    message.replyAt = Date.now();
    saveDB(db);
  }

  res.json({ success: true });
});

app.get("/api/latest", (_req, res) => {
  const db = loadDB();
  res.json({ message: db.messages[0] || null });
});

app.get("/api/status", (_req, res) => {
  const db = loadDB();
  res.json({ latest: db.messages[0] || null });
});

app.listen(PORT, (error) => {
  if (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }

  logger.info({ port: PORT }, "Naztify server listening");
});
