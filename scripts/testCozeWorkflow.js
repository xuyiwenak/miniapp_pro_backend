const https = require("https");
const path = require("path");
const fs = require("fs");

function getCozeConfig() {
  const cfgPath = path.join(
    __dirname,
    "..",
    "src",
    "sysconfig",
    "development",
    "server_auth_config.json",
  );
  const raw = fs.readFileSync(cfgPath, "utf8");
  const json = JSON.parse(raw);
  if (!json.coze || !json.coze.token || !json.coze.workflowId) {
    throw new Error("server_auth_config.json 里的 coze 配置不完整");
  }
  return json.coze;
}

function runTest() {
  const cfg = getCozeConfig();
  const url = new URL("/v1/workflow/run", cfg.baseUrl || "https://api.coze.cn");

  const body = JSON.stringify({
    workflow_id: cfg.workflowId,
    parameters: { test: "ping" },
    is_async: true,
  });

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  console.log("Sending request to:", `${url}`);

  const req = https.request(options, (res) => {
    const chunks = [];
    res.on("data", (d) => chunks.push(d));
    res.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      console.log("HTTP status:", res.statusCode);
      try {
        const json = JSON.parse(raw);
        console.log("Coze response JSON:", JSON.stringify(json, null, 2));
      } catch (e) {
        console.log("Raw response body:", raw);
      }
    });
  });

  req.on("error", (err) => {
    console.error("Request error:", err);
  });

  req.write(body);
  req.end();
}

runTest();

