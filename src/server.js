const http = require("http");
const env = process.env.APP_ENV || "local";
const version = process.env.APP_VERSION || "1.0.0";

http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200); return res.end("ok"); }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ app: "web-app", env, version }));
}).listen(8080, () => console.log(`web-app listening on 8080 (${env})`));
