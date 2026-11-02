import net from "node:net";

/** Bind an ephemeral loopback port for local Pages verification. */
export function allocatePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(preferred, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : preferred;
      server.close(() => resolve(port));
    });
  });
}

export function pagesBaseUrl(port, prefix) {
  return `http://127.0.0.1:${port}${prefix}/`;
}
