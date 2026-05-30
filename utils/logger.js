// utils/logger.js
// Minimal structured logger. Outputs JSON in production, readable text in dev.
const isProd = process.env.NODE_ENV === "production";

function log(level, msg, meta) {
  const ts = new Date().toISOString();
  if (isProd) {
    process.stdout.write(JSON.stringify({ ts, level, msg, ...meta }) + "\n");
  } else {
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    const out = `[${ts}] ${level.toUpperCase().padEnd(5)}: ${msg}${metaStr}`;
    if (level === "error") {
      process.stderr.write(out + "\n");
    } else {
      process.stdout.write(out + "\n");
    }
  }
}

const logger = {
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};

module.exports = logger;
