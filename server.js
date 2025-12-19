const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// (eventually) stores all active lobbies
const lobbies = {};

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

    socket.on("disconnect", () => {
        console.log("Player disconnected", socket.id);
    });

    socket.on("createLobby", (playerName) => {
        let code;

        do {
            code = generateLobbyCode();
        } while (lobbies[code]);

        lobbies[code] = {
            players: [],
            gameStarted: false
        };

        lobbies[code].players.push({
            id: socket.id,
            name: playerName
        });

        socket.join(code);

        socket.emit("lobbyCreated", {
            code,
            players: lobbies[code].players
        });

        console.log(`Lobby ${code} created by ${playerName}`);
    })

    socket.on("joinLobby", ({code, playerName}) => {
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

        lobby.players.push({
            id: socket.id,
            name: playerName
        });

        socket.join(code);

        io.to(code).emit("lobbyUpdated", {
            code,
            players: lobby.players
        });

        console.log(`${playerName} joined lobby ${code}`);
    });

    socket.on("disconnect", () => {
        console.log("Disconnected: ", socket.id);

        for (const code in lobbies) {
            const lobby = lobbies[code];
            const index = lobby.players.findIndex(p => p.id === socket.id);

            if (index !== -1) {
                lobby.players.splice(index, 1);

                if (lobby.players.length === 0) {
                    delete lobbies[code];
                    console.log(`Lobby ${code} deleted`);
                } else {
                    io.to(code).emit("LobbyUpdated", {
                        code,
                        players: lobby.players
                    });
                }
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
