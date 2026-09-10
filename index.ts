const server = Bun.serve({
  port: 12525,

  fetch(request, server) {
    if (server.upgrade(request)) {
      return;
    }

    return new Response("Bun Burner");
  },

  websocket: {
    open() {
      console.log("Bitburner connected");
    },

    message(_, message) {
      console.log("📨", message);
    },

    close() {
      console.log("Bitburner disconnected");
    },
  },
});

console.log(`Bun Burner listening on ws://${server.hostname}:${server.port}`);
