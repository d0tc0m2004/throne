// Throne - A tactical chess-like game

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
        this.board = [];
        this.currentPlayer = PLAYER.WHITE;
        this.selectedPiece = null;
        this.validMoves = [];
        this.sacrificeUsed = { white: false, black: false };
        this.kingImmune = { white: false, black: false };
        this.championDoubleMove = { white: false, black: false };
        this.instantKillMode = false;
        this.sacrificeMode = false;
        this.gameOver = false;
        
        this.initBoard();
        this.render();
        this.bindEvents();
    }

    initBoard() {
        // Initialize empty 5x5 board
        this.board = Array(5).fill(null).map(() => Array(5).fill(null));
        
        // Place White pieces (bottom - rows 3,4)
        // Row 4 (back row for white): Tower, Soldier, King, Soldier, Tower? 
        // Let's do: Soldier, Tower, King, Champion, Soldier
        this.board[4][0] = { type: PIECES.SOLDIER, player: PLAYER.WHITE };
        this.board[4][1] = { type: PIECES.TOWER, player: PLAYER.WHITE };
        this.board[4][2] = { type: PIECES.KING, player: PLAYER.WHITE };
        this.board[4][3] = { type: PIECES.CHAMPION, player: PLAYER.WHITE };
        this.board[4][4] = { type: PIECES.SOLDIER, player: PLAYER.WHITE };
        
        // Place Black pieces (top - rows 0,1)
        this.board[0][0] = { type: PIECES.SOLDIER, player: PLAYER.BLACK };
        this.board[0][1] = { type: PIECES.CHAMPION, player: PLAYER.BLACK };
        this.board[0][2] = { type: PIECES.KING, player: PLAYER.BLACK };
        this.board[0][3] = { type: PIECES.TOWER, player: PLAYER.BLACK };
        this.board[0][4] = { type: PIECES.SOLDIER, player: PLAYER.BLACK };
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

                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece.player}`;
                    pieceEl.textContent = piece.type;
                    
                    // Show if king is immune
                    if (piece.type === PIECES.KING && this.kingImmune[piece.player]) {
                        cell.classList.add('king-immune');
                    }
                    
                    cell.appendChild(pieceEl);
                }

                // Highlight selected
                if (this.selectedPiece && 
                    this.selectedPiece.row === row && 
                    this.selectedPiece.col === col) {
                    cell.classList.add('selected');
                }

                // Highlight valid moves
                const isValidMove = this.validMoves.some(m => m.row === row && m.col === col);
                if (isValidMove) {
                    if (this.board[row][col]) {
                        cell.classList.add('valid-capture');
                    } else {
                        cell.classList.add('valid-move');
                    }
                }

                boardEl.appendChild(cell);
            }
        }

        // Update turn indicator
        document.getElementById('turn-indicator').textContent = 
            `${this.currentPlayer === PLAYER.WHITE ? 'White' : 'Black'}'s Turn`;

        // Update sacrifice status
        document.getElementById('p1-sacrifice').textContent = 
            this.sacrificeUsed.white ? 'Sacrifice Used' : 'Sacrifice Ready';
        document.getElementById('p1-sacrifice').classList.toggle('used', this.sacrificeUsed.white);
        
        document.getElementById('p2-sacrifice').textContent = 
            this.sacrificeUsed.black ? 'Sacrifice Used' : 'Sacrifice Ready';
        document.getElementById('p2-sacrifice').classList.toggle('used', this.sacrificeUsed.black);

        // Update sacrifice button
        const sacrificeBtn = document.getElementById('sacrifice-btn');
        sacrificeBtn.disabled = this.sacrificeUsed[this.currentPlayer] || this.gameOver;
    }

    bindEvents() {
        document.getElementById('board').addEventListener('click', (e) => {
            if (this.gameOver) return;
            
            const cell = e.target.closest('.cell');
            if (!cell) return;

            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            
            this.handleCellClick(row, col);
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetGame();
        });

        document.getElementById('sacrifice-btn').addEventListener('click', () => {
            if (!this.sacrificeUsed[this.currentPlayer]) {
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

        document.getElementById('message-close').addEventListener('click', () => {
            document.getElementById('message-overlay').classList.remove('active');
            this.resetGame();
        });
    }

    handleCellClick(row, col) {
        const piece = this.board[row][col];

        // Instant kill mode - click on adjacent enemy to kill
        if (this.instantKillMode) {
            if (piece && piece.player !== this.currentPlayer) {
                // Check if adjacent to any of our pieces
                const adjacent = this.getAdjacentCells(row, col);
                const hasAdjacentAlly = adjacent.some(pos => {
                    const p = this.board[pos.row][pos.col];
                    return p && p.player === this.currentPlayer;
                });
                
                if (hasAdjacentAlly) {
                    // Kill the piece
                    if (piece.type === PIECES.KING) {
                        this.board[row][col] = null;
                        this.endGame(this.currentPlayer);
                        return;
                    }
                    this.board[row][col] = null;
                    this.instantKillMode = false;
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
        if (piece && piece.player === this.currentPlayer) {
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
                // King moves 1 square in any direction
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        this.addMoveIfValid(moves, row + dr, col + dc, piece.player);
                    }
                }
                break;
                
            case PIECES.CHAMPION:
                // Champion moves like queen but max 2 squares
                const directions = [
                    [-1, 0], [1, 0], [0, -1], [0, 1],  // orthogonal
                    [-1, -1], [-1, 1], [1, -1], [1, 1]  // diagonal
                ];
                for (const [dr, dc] of directions) {
                    for (let i = 1; i <= 2; i++) {
                        const newRow = row + dr * i;
                        const newCol = col + dc * i;
                        if (!this.addMoveIfValid(moves, newRow, newCol, piece.player)) {
                            break; // Blocked
                        }
                        // Stop if we hit a piece (can capture but not go through)
                        if (this.board[newRow]?.[newCol]) break;
                    }
                }
                break;
                
            case PIECES.TOWER:
                // Tower moves like rook but max 3 squares
                const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dr, dc] of rookDirs) {
                    for (let i = 1; i <= 3; i++) {
                        const newRow = row + dr * i;
                        const newCol = col + dc * i;
                        if (!this.addMoveIfValid(moves, newRow, newCol, piece.player)) {
                            break;
                        }
                        if (this.board[newRow]?.[newCol]) break;
                    }
                }
                break;
                
            case PIECES.SOLDIER:
                // Soldier moves 1 square forward or sideways (not backward, not diagonal)
                const forward = piece.player === PLAYER.WHITE ? -1 : 1;
                this.addMoveIfValid(moves, row + forward, col, piece.player); // forward
                this.addMoveIfValid(moves, row, col - 1, piece.player); // left
                this.addMoveIfValid(moves, row, col + 1, piece.player); // right
                break;
        }
        
        return moves;
    }

    addMoveIfValid(moves, row, col, player) {
        if (row < 0 || row > 4 || col < 0 || col > 4) return false;
        
        const targetPiece = this.board[row][col];
        
        if (!targetPiece) {
            moves.push({ row, col });
            return true;
        }
        
        if (targetPiece.player !== player) {
            // Can't capture immune king
            if (targetPiece.type === PIECES.KING && this.kingImmune[targetPiece.player]) {
                return false;
            }
            moves.push({ row, col });
            return true;
        }
        
        return false; // Own piece blocking
    }

    movePiece(toRow, toCol) {
        const { row: fromRow, col: fromCol, piece } = this.selectedPiece;
        const capturedPiece = this.board[toRow][toCol];
        
        // Check if capturing enemy king
        if (capturedPiece && capturedPiece.type === PIECES.KING) {
            this.board[toRow][toCol] = piece;
            this.board[fromRow][fromCol] = null;
            this.endGame(this.currentPlayer);
            return;
        }
        
        // Execute move
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // Check for king reaching back row
        if (piece.type === PIECES.KING) {
            const backRow = piece.player === PLAYER.WHITE ? 0 : 4;
            if (toRow === backRow) {
                this.endGame(this.currentPlayer);
                return;
            }
        }
        
        // Champion double move
        if (this.championDoubleMove[this.currentPlayer] && piece.type === PIECES.CHAMPION) {
            this.championDoubleMove[this.currentPlayer] = false;
            this.selectedPiece = { row: toRow, col: toCol, piece };
            this.validMoves = this.getValidMoves(toRow, toCol, piece);
            this.render();
            return; // Don't end turn, champion moves again
        }
        
        this.endTurn();
    }

    endTurn() {
        // Clear immunity at start of YOUR next turn (so it lasts through opponent's turn)
        // Actually, let's make immunity last until end of opponent's turn
        // So we clear it when it becomes that player's turn again
        
        this.selectedPiece = null;
        this.validMoves = [];
        
        // Switch player
        this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        
        // Clear immunity for current player (it lasted one full round)
        this.kingImmune[this.currentPlayer] = false;
        
        this.render();
    }

    openSacrificePanel() {
        const panel = document.getElementById('sacrifice-panel');
        panel.classList.add('active');
        
        // Check which sacrifices are available (must have the piece)
        const hasSoldier = this.hasPiece(PIECES.SOLDIER, this.currentPlayer);
        const hasTower = this.hasPiece(PIECES.TOWER, this.currentPlayer);
        const hasChampion = this.hasPiece(PIECES.CHAMPION, this.currentPlayer);
        
        document.querySelector('[data-effect="double-move"]').disabled = !hasSoldier || !this.hasPiece(PIECES.CHAMPION, this.currentPlayer);
        document.querySelector('[data-effect="king-shield"]').disabled = !hasTower;
        document.querySelector('[data-effect="instant-kill"]').disabled = !hasChampion;
    }

    closeSacrificePanel() {
        document.getElementById('sacrifice-panel').classList.remove('active');
    }

    hasPiece(type, player) {
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const piece = this.board[row][col];
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
                const piece = this.board[row][col];
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
                // Sacrifice a soldier, champion moves twice
                this.sacrificePiece(PIECES.SOLDIER);
                this.championDoubleMove[this.currentPlayer] = true;
                break;
                
            case 'king-shield':
                // Sacrifice tower, king is immune for 1 turn
                this.sacrificePiece(PIECES.TOWER);
                this.kingImmune[this.currentPlayer] = true;
                break;
                
            case 'instant-kill':
                // Sacrifice champion, kill any adjacent enemy
                this.sacrificePiece(PIECES.CHAMPION);
                this.instantKillMode = true;
                // Highlight valid targets
                break;
        }
        
        this.sacrificeUsed[this.currentPlayer] = true;
        this.render();
        
        if (this.instantKillMode) {
            alert('Click on any enemy piece adjacent to one of your pieces to eliminate it!');
        }
    }

    sacrificePiece(type) {
        const pos = this.findPiece(type, this.currentPlayer);
        if (pos) {
            this.board[pos.row][pos.col] = null;
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

    endGame(winner) {
        this.gameOver = true;
        const message = `${winner === PLAYER.WHITE ? 'White' : 'Black'} Wins!`;
        document.getElementById('message-text').textContent = message;
        document.getElementById('message-overlay').classList.add('active');
    }

    resetGame() {
        this.board = [];
        this.currentPlayer = PLAYER.WHITE;
        this.selectedPiece = null;
        this.validMoves = [];
        this.sacrificeUsed = { white: false, black: false };
        this.kingImmune = { white: false, black: false };
        this.championDoubleMove = { white: false, black: false };
        this.instantKillMode = false;
        this.sacrificeMode = false;
        this.gameOver = false;
        
        this.initBoard();
        this.render();
    }
}

// Start the game
const game = new ThroneGame();
