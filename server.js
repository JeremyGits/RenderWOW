import path from "path";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import getPort from "get-port";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// Middleware
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan("dev"));

// Health check
app.get("/healthz", (req, res) => res.json({ ok: true }));

// Static
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h",
  extensions: ["html"]
}));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server on a free port
const requested = Number(process.env.PORT) || 5173;
const candidates = [requested, 5174, 5175];

const port = await getPort({ port: candidates.concat(0) });
app.listen(port, () => {
  console.log("RenderWOW running at http://localhost:" + port);
  if (port !== requested) {
    console.log("Note: requested port " + requested + " was busy; using " + port + " instead.");
  }
});
