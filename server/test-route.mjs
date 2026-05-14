import express from "express";
import http from "http";

const app = express();

app.get("/api/admin/coaches", (req, res) => res.json({ route: "list" }));
app.patch("/api/admin/coaches/:id/profile", (req, res) => res.json({ route: "patch" }));
app.get("/api/admin/coaches/:id/availability", (req, res) =>
  res.json({ route: "availability", id: req.params.id })
);
app.get("/api/admin/coaches/:id/sessions", (req, res) =>
  res.json({ route: "sessions", id: req.params.id })
);

const server = app.listen(0, () => {
  const port = server.address().port;
  console.log("Listening on", port);
  const paths = [
    "/api/admin/coaches",
    "/api/admin/coaches/7/availability",
    "/api/admin/coaches/7/sessions",
    "/api/admin/coaches/7/notexist",
  ];
  let done = 0;
  for (const p of paths) {
    http.get("http://localhost:" + port + p, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        console.log(p, "→", res.statusCode, b);
        if (++done === paths.length) { server.close(); process.exit(0); }
      });
    });
  }
});
