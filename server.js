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

function getHostId(lobby) {
    const host = lobby.players.find(p => p.isHost);
    return host ? host.id : null;
}

const suitOrder = {"♠": 0, "♣": 1, "♦": 2, "♥": 3};
const rankOrder = {"3": 0, "4": 1, "5": 2, "6": 3, "7": 4, "8": 5, "9": 6, "10": 7, "J": 8, "Q": 9, "K": 10, "A": 11, "2": 12}

function compareCards(a, b) {
    if (rankOrder[a.rank] !== rankOrder[b.rank]) {
        return rankOrder[a.rank] - rankOrder[b.rank];
    }
    return suitOrder[a.suit] - suitOrder[b.suit];
}

function createDeck() {
    const suits = ["♠", "♣", "♦", "♥"];
    const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
    const deck = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ rank, suit });
        }
    }

    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealCards(lobby) {
    const deck = shuffleDeck(createDeck());
    lobby.deck = deck;

    lobby.players.forEach((player, i) => {
        player.hand = deck.slice(i * 13, (i + 1) * 13);
        player.hand.sort(compareCards);
    })
}

function findStartingPlayer(lobby) {
    for (let i = 0; i < lobby.players.length; i++) {
        if (lobby.players[i].hand.some(c => c.rank === "3" && c.suit === "♠")) {
            return i;
        }
    }
    return 0;
}

const PORT = 3000;

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Player connected: ", socket.id);

    // == CREATE LOBBY ==
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
            players: [{ id: socket.id, name: playerName, isHost: true }],
            gameStarted: false,
            turnIndex: 0,
            pile: [],
            deck: []
        };

        socketLobbyMap[socket.id] = code;
        socket.join(code);

        socket.emit("lobbyCreated", {
            code,
            lobbyName: lobbies[code].name,
            players: lobbies[code].players,
            hostId: getHostId(lobbies[code]),
            playerSocketId: socket.id
        });

        console.log(`Lobby ${code} created by ${playerName}`);
    })

    // == JOIN LOBBY ==
    socket.on("joinLobby", ({code, playerName}) => {
        if (!playerName || playerName.trim() === "") {
            socket.emit("errorMessage", "Name is required");
            return;
        }

        if (socketLobbyMap[socket.id]) {
            socket.emit("errorMessage", "You are already in a lobby");
            return;
        }

        const lobby = lobbies[code.toUpperCase()];
        code = code.toUpperCase();

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
            name: playerName,
            isHost: false
        })

        socketLobbyMap[socket.id] = code;
        socket.join(code);

        io.to(code).emit("lobbyUpdated", {
            code,
            lobbyName: lobby.name,
            players: lobby.players,
            hostId: getHostId(lobby),
        });

        console.log(`${playerName} joined lobby ${code}`);
    });

    function removePlayerFromLobby(socketId) {
        const code = socketLobbyMap[socketId];
        if (!code) return;

        const lobby = lobbies[code];
        if (!lobby) return;

        const index = lobby.players.findIndex(p => p.id === socketId);
        if (index === -1) return;

        const leavingPlayer = lobby.players[index];
        lobby.players.splice(index, 1);
        delete socketLobbyMap[socketId];

        if (leavingPlayer.isHost && lobby.players.length > 0) {
            lobby.players[0].isHost = true;
        }

        if (lobby.players.length === 0) {
            delete lobbies[code];
            console.log(`Lobby ${code} deleted`);
            return;
        }

        io.to(code).emit("lobbyUpdated", {
            code,
            lobbyName: lobby.name,
            players: lobby.players,
            hostId: getHostId(lobby)
        });
    }

    // == LEAVE LOBBY ==
    socket.on("leaveLobby", (code) => {
        removePlayerFromLobby(socket.id);
    });

    // == DISCONNECT ==
    socket.on("disconnect", () => {
        console.log("Disconnected: ", socket.id);
        removePlayerFromLobby(socket.id);
    });

    socket.on("startGame", (code) => {
        const lobby = lobbies[code];
        if (!lobby) {
            socket.emit("errorMessage", "Lobby not found");
            return;
        }

        const host = lobby.players.find(p => p.isHost);
        if (!host || socket.id !== host.id) {
            socket.emit("errorMessage", "Only the host can start the game");
            return;
        }

        if (lobby.gameStarted) {
            socket.emit("errorMessage", "Game already started");
            return;
        }

        if (lobby.players.length < 4) {
            socket.emit("errorMessage", "Need 4 players to start");
            return;
        }

        lobby.gameStarted = true;
        dealCards(lobby);
        lobby.turnIndex = findStartingPlayer(lobby);

        lobby.players.forEach((player, i) => {
            io.to(player.id).emit("gameStarted", {
                hand: player.hand,
                turnIndex: lobby.turnIndex,
                players: lobby.players.map(p => ({ name: p.name }))
            });
        });

        io.to(code).emit("gameMessage", "Game Started! " + lobby.players[lobby.turnIndex].name + " begins with 3♠");
    });

    socket.on("assignHost", ({code, newHostId}) => {
        const lobby = lobbies[code];
        if (!lobby) return;

        const host = lobby.players.find(p => p.isHost);
        if (!host || socket.id !== host.id) {
            socket.emit("errorMessage", "Only the host can assign a new host");
            return;
        }

        lobby.players.forEach(p => p.isHost = (p.id === newHostId));
        
        io.to(code).emit("lobbyUpdated", {
            code,
            lobbyName: lobby.name,
            players: lobby.players,
            hostId: newHostId
        })
    })
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
