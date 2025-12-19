const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// (eventually) stores all active lobbies
const lobbies = {};
const socketLobbyMap = {};

function generateLobbyCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += letters[Math.floor(Math.random() * letters.length)];
    }
    return code;
} 

const PORT = 3000;

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Player connected: ", socket.id);

    socket.on("createLobby", ({playerName, lobbyName}) => {
        if (!playerName || playerName.trim() === "") {
            socket.emit("errorMessage", "Name is required");
            return;
        }

        if (socketLobbyMap[socket.id]) {
            socket.emit("errorMessage", "You are already in a lobby");
            return;
        }

        let code;

        do {
            code = generateLobbyCode();
        } while (lobbies[code]);

        lobbies[code] = {
            name: lobbyName || "Unnamed Lobby",
            players: [],
            gameStarted: false
        };

        lobbies[code].players.push({
            id: socket.id,
            name: playerName
        });

        socketLobbyMap[socket.id] = code;
        socket.join(code);

        socket.emit("lobbyCreated", {
            code,
            lobbyName: lobbies[code].name,
            players: lobbies[code].players
        });

        console.log(`Lobby ${code} created by ${playerName}`);
    })

    socket.on("joinLobby", ({code, playerName}) => {
        if (!playerName || playerName.trim() === "") {
            socket.emit("errorMessage", "Name is required");
            return;
        }

        if (socketLobbyMap[socket.id]) {
            socket.emit("errorMessage", "You are already in a lobby");
            return;
        }

        const lobby = lobbies[code];

        if (!lobby) {
            socket.emit("errorMessage", "Lobby not found");
            return;
        }

        if (lobby.players.length >= 4) {
            socket.emit("errorMessage", "Lobby is full");
            return;
        }

        if (lobby.gameStarted) {
            socket.emit("errorMessage", "Game already started");
            return;
        }

        const nameTaken = lobby.players.some(p => p.name === playerName);
        if (nameTaken) {
            socket.emit("errorMessage", "Name already taken in this lobby");
            return;
        }

        lobby.players.push({
            id: socket.id,
            name: playerName
        });

        socketLobbyMap[socket.id] = code;
        socket.join(code);

        io.to(code).emit("lobbyUpdated", {
            code,
            lobbyName: lobby.name,
            players: lobby.players
        });

        console.log(`${playerName} joined lobby ${code}`);
    });

    socket.on("disconnect", () => {
        console.log("Disconnected: ", socket.id);
        const code = socketLobbyMap[socket.id];
        if (!code) return;

        const lobby = lobbies[code];
        if (!lobby) return;

        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        delete socketLobbyMap[socket.id];

        if (lobby.players.length === 0) {
            delete lobbies[code];
            console.log(`Lobby ${code} deleted`);
        } else {
            io.to(code).emit("lobbyUpdated", {
                code,
                lobbyName: lobby.name,
                players: lobby.players
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
