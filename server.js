const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Player connected: ", socket.id);

    socket.on("disconnect", () => {
        console.log("Player disconnected", socket.io);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
