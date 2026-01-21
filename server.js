const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active game rooms
const rooms = new Map();

// Generate a random 4-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create initial game state
function createGameState() {
    const board = Array(5).fill(null).map(() => Array(5).fill(null));
    
    // Black pieces (top)
    board[0][0] = { type: 'S', player: 'black' };
    board[0][1] = { type: 'C', player: 'black' };
    board[0][2] = { type: 'K', player: 'black' };
    board[0][3] = { type: 'T', player: 'black' };
    board[0][4] = { type: 'S', player: 'black' };
    
    // White pieces (bottom)
    board[4][0] = { type: 'S', player: 'white' };
    board[4][1] = { type: 'T', player: 'white' };
    board[4][2] = { type: 'K', player: 'white' };
    board[4][3] = { type: 'C', player: 'white' };
    board[4][4] = { type: 'S', player: 'white' };
    
    return {
        board,
        currentPlayer: 'white',
        sacrificeUsed: { white: false, black: false },
        kingImmune: { white: false, black: false },
        championDoubleMove: { white: false, black: false },
        instantKillMode: false,
        gameOver: false,
        winner: null
    };
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Create a new room
    socket.on('create-room', (callback) => {
        let roomCode = generateRoomCode();
        // Make sure code is unique
        while (rooms.has(roomCode)) {
            roomCode = generateRoomCode();
        }
        
        const room = {
            code: roomCode,
            players: {
                white: socket.id,
                black: null
            },
            gameState: createGameState(),
            spectators: []
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerColor = 'white';
        
        console.log(`Room created: ${roomCode} by ${socket.id}`);
        
        callback({ 
            success: true, 
            roomCode, 
            playerColor: 'white',
            gameState: room.gameState
        });
    });
    
    // Join an existing room
    socket.on('join-room', (roomCode, callback) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);
        
        if (!room) {
            callback({ success: false, error: 'Room not found' });
            return;
        }
        
        if (room.players.black !== null) {
            callback({ success: false, error: 'Room is full' });
            return;
        }
        
        room.players.black = socket.id;
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerColor = 'black';
        
        console.log(`Player ${socket.id} joined room ${roomCode} as black`);
        
        callback({ 
            success: true, 
            roomCode, 
            playerColor: 'black',
            gameState: room.gameState
        });
        
        // Notify white player that opponent joined
        socket.to(roomCode).emit('opponent-joined');
    });
    
    // Handle move
    socket.on('move', (moveData) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        // Verify it's this player's turn
        if (room.gameState.currentPlayer !== socket.playerColor) {
            return;
        }
        
        // Update game state
        room.gameState = moveData.gameState;
        
        // Broadcast to opponent
        socket.to(socket.roomCode).emit('opponent-move', {
            gameState: room.gameState
        });
    });
    
    // Handle sacrifice
    socket.on('sacrifice', (sacrificeData) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        if (room.gameState.currentPlayer !== socket.playerColor) {
            return;
        }
        
        room.gameState = sacrificeData.gameState;
        
        socket.to(socket.roomCode).emit('opponent-sacrifice', {
            gameState: room.gameState
        });
    });
    
    // Handle game over
    socket.on('game-over', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        room.gameState.gameOver = true;
        room.gameState.winner = data.winner;
        
        socket.to(socket.roomCode).emit('game-ended', {
            winner: data.winner
        });
    });
    
    // Handle rematch request
    socket.on('request-rematch', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        socket.to(socket.roomCode).emit('rematch-requested');
    });
    
    // Handle rematch accept
    socket.on('accept-rematch', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        // Swap colors
        const temp = room.players.white;
        room.players.white = room.players.black;
        room.players.black = temp;
        
        // Reset game state
        room.gameState = createGameState();
        
        // Notify both players
        io.to(room.players.white).emit('rematch-start', {
            playerColor: 'white',
            gameState: room.gameState
        });
        
        io.to(room.players.black).emit('rematch-start', {
            playerColor: 'black',
            gameState: room.gameState
        });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                // Notify other player
                socket.to(socket.roomCode).emit('opponent-disconnected');
                
                // Clean up room after a delay (in case of reconnect)
                setTimeout(() => {
                    const currentRoom = rooms.get(socket.roomCode);
                    if (currentRoom) {
                        // Check if both players are gone
                        const whiteSocket = io.sockets.sockets.get(currentRoom.players.white);
                        const blackSocket = io.sockets.sockets.get(currentRoom.players.black);
                        
                        if (!whiteSocket && !blackSocket) {
                            rooms.delete(socket.roomCode);
                            console.log(`Room ${socket.roomCode} deleted`);
                        }
                    }
                }, 30000); // 30 second grace period
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Throne server running on http://localhost:${PORT}`);
});
