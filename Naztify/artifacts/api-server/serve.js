const http = require("http");
const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const DASHBOARD_PATH = path.resolve(__dirname, "templates", "dashboard.html");
const HER_PATH = path.resolve(__dirname, "templates", "her.html");
const MANIFEST_PATH = path.resolve(__dirname, "manifest.json");
const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const DB_PATH = path.resolve(__dirname, "db.json");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    }
  } catch (_) {}

  return { messages: [] };
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDB();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

function json(res, data, code = 200) {
  send(res, code, JSON.stringify(data), {
    "content-type": "application/json",
  });
}

function serveFile(filePath, res) {
  if (!fs.existsSync(filePath)) {
    return send(res, 404, "Not Found", { "content-type": "text/plain" });
  }

  const contentType =
    MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";

  send(res, 200, fs.readFileSync(filePath), { "content-type": contentType });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return json(res, { error: "Manifest not found" }, 404);
  }

  send(res, 200, fs.readFileSync(manifestPath), {
    "content-type": "application/json; charset=utf-8",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  if (basePath && basePath !== "/" && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (pathname === "/manifest.json") {
    return serveFile(MANIFEST_PATH, res);
  }

  if (pathname === "/status") {
    return json(res, { ok: true });
  }

  if (pathname === "/" && fs.existsSync(TEMPLATE_PATH)) {
    return serveFile(TEMPLATE_PATH, res);
  }

  if (pathname === "/dashboard" || pathname === "/sender") {
    return serveFile(DASHBOARD_PATH, res);
  }

  if (pathname === "/her" || pathname === "/receiver") {
    return serveFile(HER_PATH, res);
  }

  if (pathname === "/api/send" && req.method === "POST") {
    const { moodId, message, emoji, color } = await parseBody(req);
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
    return json(res, { success: true, entry });
  }

  if (pathname === "/api/reply" && req.method === "POST") {
    const { messageId, reply, replyEmoji } = await parseBody(req);
    const msg = db.messages.find((message) => message.id === messageId);

    if (msg) {
      msg.reply = reply;
      msg.replyEmoji = replyEmoji;
      msg.replyAt = Date.now();
      saveDB(db);
    }

    return json(res, { success: true });
  }

  if (pathname === "/api/latest") {
    return json(res, { message: db.messages[0] || null });
  }

  if (pathname === "/api/status") {
    return json(res, { latest: db.messages[0] || null });
  }

  if (pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }
  }

  const staticPath = path.resolve(STATIC_ROOT, pathname.replace(/^\/+/, ""));
  if (staticPath.startsWith(STATIC_ROOT) && fs.existsSync(staticPath)) {
    return serveFile(staticPath, res);
  }

  send(res, 404, "Not Found", { "content-type": "text/plain" });
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => console.log(`Serving on port ${port}`));
