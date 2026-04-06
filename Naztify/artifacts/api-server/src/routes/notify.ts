import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();
const DB_PATH = path.resolve(process.cwd(), "db.json");
const TEMPLATES = path.resolve(process.cwd(), "templates");
const MANIFEST_PATH = path.resolve(process.cwd(), "manifest.json");

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    }
  } catch {}

  return { messages: [] };
}

function saveDB(db: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendTemplate(res: any, fileName: string) {
  const filePath = path.join(TEMPLATES, fileName);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
    return;
  }

  res.status(404).send("Not Found");
}

router.get("/", (_req, res) => sendTemplate(res, "landing-page.html"));
router.get("/dashboard", (_req, res) => sendTemplate(res, "dashboard.html"));
router.get("/sender", (_req, res) => sendTemplate(res, "dashboard.html"));
router.get("/her", (_req, res) => sendTemplate(res, "her.html"));
router.get("/receiver", (_req, res) => sendTemplate(res, "her.html"));

router.get("/manifest.json", (_req, res) => {
  if (fs.existsSync(MANIFEST_PATH)) {
    res.type("application/manifest+json").sendFile(MANIFEST_PATH);
    return;
  }

  res.status(404).send("Not Found");
});

router.post("/api/send", (req, res) => {
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
  res.json({ success: true, entry });
});

router.post("/api/reply", (req, res) => {
  const { messageId, reply, replyEmoji } = req.body;
  const db = loadDB();
  const msg = db.messages.find((message: any) => message.id === messageId);

  if (msg) {
    msg.reply = reply;
    msg.replyEmoji = replyEmoji;
    msg.replyAt = Date.now();
    saveDB(db);
  }

  res.json({ success: true });
});

router.get("/api/latest", (_req, res) => {
  const db = loadDB();
  res.json({ message: db.messages[0] || null });
});

router.get("/api/status", (_req, res) => {
  const db = loadDB();
  res.json({ latest: db.messages[0] || null });
});

export default router;
