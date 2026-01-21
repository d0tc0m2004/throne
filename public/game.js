// Throne - Online Multiplayer Version

const PIECES = {
    KING: 'K',
    CHAMPION: 'C',
    TOWER: 'T',
    SOLDIER: 'S'
};

const PLAYER = {
    WHITE: 'white',
    BLACK: 'black'
};

class ThroneGame {
    constructor() {
        this.socket = io();
        this.roomCode = null;
        this.playerColor = null;
        this.gameState = null;
        this.selectedPiece = null;
        this.validMoves = [];
        this.instantKillMode = false;
        
        this.bindLobbyEvents();
        this.bindSocketEvents();
    }

    bindLobbyEvents() {
        // How to Play guide
        document.getElementById('how-to-play-btn').addEventListener('click', () => {
            document.getElementById('guide-overlay').classList.add('active');
        });

        document.getElementById('guide-close').addEventListener('click', () => {
            document.getElementById('guide-overlay').classList.remove('active');
        });

        document.getElementById('guide-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('guide-overlay')) {
                document.getElementById('guide-overlay').classList.remove('active');
            }
        });

        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            const code = document.getElementById('room-code-input').value.trim();
            if (code.length === 4) {
                this.joinRoom(code);
            } else {
                this.showError('Please enter a 4-character room code');
            }
        });

        document.getElementById('room-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('join-room-btn').click();
            }
        });

        document.getElementById('copy-code-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(this.roomCode).then(() => {
                this.showNotification('Code copied!');
            });
        });

        document.getElementById('leave-btn').addEventListener('click', () => {
            location.reload();
        });

        document.getElementById('leave-end-btn').addEventListener('click', () => {
            location.reload();
        });

        document.getElementById('rematch-btn').addEventListener('click', () => {
            this.socket.emit('request-rematch');
            document.getElementById('rematch-btn').textContent = 'Waiting...';
            document.getElementById('rematch-btn').disabled = true;
        });
    }

    bindSocketEvents() {
        this.socket.on('opponent-joined', () => {
            this.showNotification('Opponent joined!');
            this.startGame();
        });

        this.socket.on('opponent-move', (data) => {
            this.gameState = data.gameState;
            this.instantKillMode = this.gameState.instantKillMode;
            this.render();
            
            if (this.isMyTurn()) {
                this.showNotification('Your turn!');
            }
        });

        this.socket.on('opponent-sacrifice', (data) => {
            this.gameState = data.gameState;
            this.instantKillMode = this.gameState.instantKillMode;
            this.render();
            this.showNotification('Opponent used sacrifice!');
        });

        this.socket.on('game-ended', (data) => {
            this.gameState.gameOver = true;
            this.gameState.winner = data.winner;
            this.showGameOver(data.winner);
        });

        this.socket.on('opponent-disconnected', () => {
            this.showNotification('Opponent disconnected!');
        });

        this.socket.on('rematch-requested', () => {
            this.showNotification('Opponent wants a rematch!');
            document.getElementById('rematch-btn').textContent = 'Accept Rematch';
            document.getElementById('rematch-btn').disabled = false;
            document.getElementById('rematch-btn').onclick = () => {
                this.socket.emit('accept-rematch');
            };
        });

        this.socket.on('rematch-start', (data) => {
            this.playerColor = data.playerColor;
            this.gameState = data.gameState;
            this.selectedPiece = null;
            this.validMoves = [];
            this.instantKillMode = false;
            
            document.getElementById('message-overlay').classList.remove('active');
            document.getElementById('your-color').textContent = `You are: ${this.playerColor === 'white' ? 'White' : 'Black'}`;
            
            this.render();
            this.showNotification('Rematch started! Colors swapped.');
        });
    }

    createRoom() {
        this.socket.emit('create-room', (response) => {
            if (response.success) {
                this.roomCode = response.roomCode;
                this.playerColor = response.playerColor;
                this.gameState = response.gameState;
                
                document.getElementById('display-room-code').textContent = this.roomCode;
                document.getElementById('lobby').classList.add('hidden');
                document.getElementById('waiting-screen').classList.add('active');
            } else {
                this.showError(response.error);
            }
        });
    }

    joinRoom(code) {
        this.socket.emit('join-room', code, (response) => {
            if (response.success) {
                this.roomCode = response.roomCode;
                this.playerColor = response.playerColor;
                this.gameState = response.gameState;
                this.startGame();
            } else {
                this.showError(response.error);
            }
        });
    }

    startGame() {
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('waiting-screen').classList.remove('active');
        document.getElementById('waiting-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.add('active');
        document.getElementById('your-color').textContent = `You are: ${this.playerColor === 'white' ? 'White' : 'Black'}`;
        
        this.bindGameEvents();
        this.render();
    }

    bindGameEvents() {
        document.getElementById('board').addEventListener('click', (e) => {
            if (this.gameState.gameOver) return;
            if (!this.isMyTurn() && !this.instantKillMode) return;
            
            const cell = e.target.closest('.cell');
            if (!cell) return;

            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            
            this.handleCellClick(row, col);
        });

        document.getElementById('sacrifice-btn').addEventListener('click', () => {
            if (!this.gameState.sacrificeUsed[this.playerColor] && this.isMyTurn()) {
                this.openSacrificePanel();
            }
        });

        document.getElementById('cancel-sacrifice').addEventListener('click', () => {
            this.closeSacrificePanel();
        });

        document.querySelectorAll('.sacrifice-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const effect = e.currentTarget.dataset.effect;
                this.handleSacrificeChoice(effect);
            });
        });
    }

    isMyTurn() {
        return this.gameState.currentPlayer === this.playerColor;
    }

    handleCellClick(row, col) {
        const piece = this.gameState.board[row][col];

        // Instant kill mode
        if (this.instantKillMode && this.isMyTurn()) {
            if (piece && piece.player !== this.playerColor) {
                const adjacent = this.getAdjacentCells(row, col);
                const hasAdjacentAlly = adjacent.some(pos => {
                    const p = this.gameState.board[pos.row][pos.col];
                    return p && p.player === this.playerColor;
                });
                
                if (hasAdjacentAlly) {
                    if (piece.type === PIECES.KING) {
                        this.gameState.board[row][col] = null;
                        this.endGame(this.playerColor);
                        return;
                    }
                    this.gameState.board[row][col] = null;
                    this.instantKillMode = false;
                    this.gameState.instantKillMode = false;
                    this.endTurn();
                    return;
                }
            }
            return;
        }

        // If clicking on a valid move, execute it
        if (this.selectedPiece && this.validMoves.some(m => m.row === row && m.col === col)) {
            this.movePiece(row, col);
            return;
        }

        // If clicking on own piece, select it
        if (piece && piece.player === this.playerColor) {
            this.selectedPiece = { row, col, piece };
            this.validMoves = this.getValidMoves(row, col, piece);
            this.render();
            return;
        }

        // Clicking elsewhere, deselect
        this.selectedPiece = null;
        this.validMoves = [];
        this.render();
    }

    getValidMoves(row, col, piece) {
        const moves = [];
        
        switch (piece.type) {
            case PIECES.KING:
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        this.addMoveIfValid(moves, row + dr, col + dc, piece.player);
                    }
                }
                break;
                
            case PIECES.CHAMPION:
                const directions = [
                    [-1, 0], [1, 0], [0, -1], [0, 1],
                    [-1, -1], [-1, 1], [1, -1], [1, 1]
                ];
                for (const [dr, dc] of directions) {
                    for (let i = 1; i <= 2; i++) {
                        const newRow = row + dr * i;
                        const newCol = col + dc * i;
                        if (!this.addMoveIfValid(moves, newRow, newCol, piece.player)) {
                            break;
                        }
                        if (this.gameState.board[newRow]?.[newCol]) break;
                    }
                }
                break;
                
            case PIECES.TOWER:
                const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dr, dc] of rookDirs) {
                    for (let i = 1; i <= 3; i++) {
                        const newRow = row + dr * i;
                        const newCol = col + dc * i;
                        if (!this.addMoveIfValid(moves, newRow, newCol, piece.player)) {
                            break;
                        }
                        if (this.gameState.board[newRow]?.[newCol]) break;
                    }
                }
                break;
                
            case PIECES.SOLDIER:
                const forward = piece.player === PLAYER.WHITE ? -1 : 1;
                this.addMoveIfValid(moves, row + forward, col, piece.player);
                this.addMoveIfValid(moves, row, col - 1, piece.player);
                this.addMoveIfValid(moves, row, col + 1, piece.player);
                break;
        }
        
        return moves;
    }

    addMoveIfValid(moves, row, col, player) {
        if (row < 0 || row > 4 || col < 0 || col > 4) return false;
        
        const targetPiece = this.gameState.board[row][col];
        
        if (!targetPiece) {
            moves.push({ row, col });
            return true;
        }
        
        if (targetPiece.player !== player) {
            if (targetPiece.type === PIECES.KING && this.gameState.kingImmune[targetPiece.player]) {
                return false;
            }
            moves.push({ row, col });
            return true;
        }
        
        return false;
    }

    movePiece(toRow, toCol) {
        const { row: fromRow, col: fromCol, piece } = this.selectedPiece;
        const capturedPiece = this.gameState.board[toRow][toCol];
        
        // Check if capturing enemy king
        if (capturedPiece && capturedPiece.type === PIECES.KING) {
            this.gameState.board[toRow][toCol] = piece;
            this.gameState.board[fromRow][fromCol] = null;
            this.endGame(this.playerColor);
            return;
        }
        
        // Execute move
        this.gameState.board[toRow][toCol] = piece;
        this.gameState.board[fromRow][fromCol] = null;
        
        // Check for king reaching back row
        if (piece.type === PIECES.KING) {
            const backRow = piece.player === PLAYER.WHITE ? 0 : 4;
            if (toRow === backRow) {
                this.endGame(this.playerColor);
                return;
            }
        }
        
        // Champion double move
        if (this.gameState.championDoubleMove[this.playerColor] && piece.type === PIECES.CHAMPION) {
            this.gameState.championDoubleMove[this.playerColor] = false;
            this.selectedPiece = { row: toRow, col: toCol, piece };
            this.validMoves = this.getValidMoves(toRow, toCol, piece);
            
            // Send intermediate state
            this.socket.emit('move', { gameState: this.gameState });
            this.render();
            return;
        }
        
        this.endTurn();
    }

    endTurn() {
        this.selectedPiece = null;
        this.validMoves = [];
        
        // Switch player
        this.gameState.currentPlayer = this.gameState.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        
        // Clear immunity for new current player
        this.gameState.kingImmune[this.gameState.currentPlayer] = false;
        
        // Send to server
        this.socket.emit('move', { gameState: this.gameState });
        
        this.render();
    }

    endGame(winner) {
        this.gameState.gameOver = true;
        this.gameState.winner = winner;
        
        this.socket.emit('game-over', { winner });
        this.showGameOver(winner);
    }

    showGameOver(winner) {
        const isWinner = winner === this.playerColor;
        document.getElementById('message-text').textContent = isWinner ? 'You Win!' : 'You Lose!';
        document.getElementById('message-overlay').classList.add('active');
        document.getElementById('rematch-btn').textContent = 'Request Rematch';
        document.getElementById('rematch-btn').disabled = false;
    }

    openSacrificePanel() {
        const panel = document.getElementById('sacrifice-panel');
        panel.classList.add('active');
        
        const hasSoldier = this.hasPiece(PIECES.SOLDIER, this.playerColor);
        const hasTower = this.hasPiece(PIECES.TOWER, this.playerColor);
        const hasChampion = this.hasPiece(PIECES.CHAMPION, this.playerColor);
        
        document.querySelector('[data-effect="double-move"]').disabled = !hasSoldier || !this.hasPiece(PIECES.CHAMPION, this.playerColor);
        document.querySelector('[data-effect="king-shield"]').disabled = !hasTower;
        document.querySelector('[data-effect="instant-kill"]').disabled = !hasChampion;
    }

    closeSacrificePanel() {
        document.getElementById('sacrifice-panel').classList.remove('active');
    }

    hasPiece(type, player) {
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const piece = this.gameState.board[row][col];
                if (piece && piece.type === type && piece.player === player) {
                    return true;
                }
            }
        }
        return false;
    }

    findPiece(type, player) {
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const piece = this.gameState.board[row][col];
                if (piece && piece.type === type && piece.player === player) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    handleSacrificeChoice(effect) {
        this.closeSacrificePanel();
        
        switch (effect) {
            case 'double-move':
                this.sacrificePiece(PIECES.SOLDIER);
                this.gameState.championDoubleMove[this.playerColor] = true;
                break;
                
            case 'king-shield':
                this.sacrificePiece(PIECES.TOWER);
                this.gameState.kingImmune[this.playerColor] = true;
                break;
                
            case 'instant-kill':
                this.sacrificePiece(PIECES.CHAMPION);
                this.instantKillMode = true;
                this.gameState.instantKillMode = true;
                this.showNotification('Click an enemy adjacent to your pieces!');
                break;
        }
        
        this.gameState.sacrificeUsed[this.playerColor] = true;
        
        this.socket.emit('sacrifice', { gameState: this.gameState });
        this.render();
    }

    sacrificePiece(type) {
        const pos = this.findPiece(type, this.playerColor);
        if (pos) {
            this.gameState.board[pos.row][pos.col] = null;
        }
    }

    getAdjacentCells(row, col) {
        const adjacent = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr;
                const c = col + dc;
                if (r >= 0 && r < 5 && c >= 0 && c < 5) {
                    adjacent.push({ row: r, col: c });
                }
            }
        }
        return adjacent;
    }

    render() {
        const boardEl = document.getElementById('board');
        boardEl.innerHTML = '';

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = row;
                cell.dataset.col = col;

                const piece = this.gameState.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece.player}`;
                    pieceEl.textContent = piece.type;
                    
                    if (piece.type === PIECES.KING && this.gameState.kingImmune[piece.player]) {
                        cell.classList.add('king-immune');
                    }
                    
                    cell.appendChild(pieceEl);
                }

                if (this.selectedPiece && 
                    this.selectedPiece.row === row && 
                    this.selectedPiece.col === col) {
                    cell.classList.add('selected');
                }

                const isValidMove = this.validMoves.some(m => m.row === row && m.col === col);
                if (isValidMove) {
                    if (this.gameState.board[row][col]) {
                        cell.classList.add('valid-capture');
                    } else {
                        cell.classList.add('valid-move');
                    }
                }

                boardEl.appendChild(cell);
            }
        }

        // Update turn indicator
        const turnIndicator = document.getElementById('turn-indicator');
        turnIndicator.textContent = `${this.gameState.currentPlayer === PLAYER.WHITE ? 'White' : 'Black'}'s Turn`;
        turnIndicator.classList.toggle('your-turn', this.isMyTurn());

        // Update sacrifice status
        document.getElementById('p1-sacrifice').textContent = 
            this.gameState.sacrificeUsed.white ? 'Sacrifice Used' : 'Sacrifice Ready';
        document.getElementById('p1-sacrifice').classList.toggle('used', this.gameState.sacrificeUsed.white);
        
        document.getElementById('p2-sacrifice').textContent = 
            this.gameState.sacrificeUsed.black ? 'Sacrifice Used' : 'Sacrifice Ready';
        document.getElementById('p2-sacrifice').classList.toggle('used', this.gameState.sacrificeUsed.black);

        // Update sacrifice button
        const sacrificeBtn = document.getElementById('sacrifice-btn');
        sacrificeBtn.disabled = this.gameState.sacrificeUsed[this.playerColor] || !this.isMyTurn() || this.gameState.gameOver;
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        setTimeout(() => {
            document.getElementById('error-message').textContent = '';
        }, 3000);
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.classList.add('active');
        setTimeout(() => {
            notification.classList.remove('active');
        }, 3000);
    }
}

// Start the game
const game = new ThroneGame();
