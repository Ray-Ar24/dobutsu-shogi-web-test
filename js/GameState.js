import { HIYOKO, NIWATORI, LION, DIRS } from './constants.js';

export class GameState {
    constructor(cloneSource = null) {
        if (cloneSource) {
            // 高速コピー: TypedArrayのsliceは高速
            this.board = cloneSource.board.slice(); 
            this.hands = cloneSource.hands.slice();
            this.turn = cloneSource.turn;
            this.moveCount = cloneSource.moveCount;
        } else {
            // 初期盤面
            this.board = new Int8Array([-2, -4, -3, 0, -1, 0, 0, 1, 0, 3, 4, 2]);
            // 持ち駒管理: Uint8Array(12)
            this.hands = new Uint8Array(12); 
            this.turn = 1;
            this.moveCount = 0;
        }
    }

    clone() {
        return new GameState(this);
    }
    
    // 定石照合用キー生成
    toStringKey() {
        return this.board.join(",") + "|" + this.turn;
    }
    
    getHandsList(turn) {
        const list = [];
        const offset = turn === 1 ? 0 : 6;
        for (let k = 1; k <= 5; k++) {
            const count = this.hands[offset + k];
            for (let c = 0; c < count; c++) {
                list.push(k);
            }
        }
        return list;
    }

    getValidMoves() {
        const moves = [];
        const turn = this.turn;
        
        // 1. 盤上の駒の移動
        for (let i = 0; i < 12; i++) {
            const p = this.board[i];
            if (p * turn > 0) { // 自駒
                const kind = Math.abs(p);
                const dirs = DIRS[kind];
                for (let d of dirs) {
                    const r_dy = (turn === 1) ? d[0] : -d[0];
                    const r_dx = (turn === 1) ? d[1] : -d[1];
                    const cy = Math.floor(i / 3), cx = i % 3;
                    const ty = cy + r_dy, tx = cx + r_dx;
                    
                    if (ty >= 0 && ty < 4 && tx >= 0 && tx < 3) {
                        const ti = ty * 3 + tx;
                        const tp = this.board[ti];
                        if (tp === 0 || tp * turn < 0) { // 空 or 敵駒
                            let promote = false;
                            if (kind === HIYOKO) {
                                if ((turn === 1 && ty === 0) || (turn === -1 && ty === 3)) promote = true;
                            }
                            moves.push({ type: 'MOVE', src: i, dst: ti, promote: promote });
                        }
                    }
                }
            }
        }
        
        // 2. 持ち駒を打つ
        const offset = turn === 1 ? 0 : 6;
        for (let k = 1; k <= 5; k++) {
            if (this.hands[offset + k] > 0) {
                for (let ei = 0; ei < 12; ei++) {
                    if (this.board[ei] === 0) {
                        // 禁じ手チェック
                        if (k === HIYOKO) {
                            const r = Math.floor(ei / 3);
                            if ((turn === 1 && r === 0) || (turn === -1 && r === 3)) continue;
                        }
                        moves.push({ type: 'DROP', src: k, dst: ei });
                    }
                }
            }
        }
        return moves;
    }

    makeMove(move) {
        const next = this.clone();
        const turn = next.turn;
        const myOffset = turn === 1 ? 0 : 6;
        
        if (move.type === 'MOVE') {
            const captured = next.board[move.dst];
            if (captured !== 0) {
                let k = Math.abs(captured);
                if (k === NIWATORI) k = HIYOKO;
                next.hands[myOffset + k]++; // 持ち駒追加
            }
            const p = next.board[move.src];
            next.board[move.dst] = move.promote ? (NIWATORI * turn) : p;
            next.board[move.src] = 0;
        } else {
            // DROP
            next.board[move.dst] = move.src * turn;
            next.hands[myOffset + move.src]--; // 持ち駒消費
        }
        
        next.turn *= -1;
        next.moveCount++;
        return next;
    }

    isGameOver() {
        let sLion = -1, gLion = -1;
        for(let i=0; i<12; i++) {
            if (this.board[i] === 4) sLion = i;
            else if (this.board[i] === -4) gLion = i;
        }

        if (sLion === -1) return { over: true, winner: -1 };
        if (gLion === -1) return { over: true, winner: 1 };
        
        // トライルール判定
        if (sLion < 3) {
            if (this.turn === 1) return { over: true, winner: 1 };
            if (!this.isAttacked(sLion, -1)) return { over: true, winner: 1 };
        }
        if (gLion >= 9) {
            if (this.turn === -1) return { over: true, winner: -1 };
            if (!this.isAttacked(gLion, 1)) return { over: true, winner: -1 };
        }
        return { over: false, winner: 0 };
    }
    
    isAttacked(targetIdx, attackerTurn) {
        for (let i = 0; i < 12; i++) {
            const p = this.board[i];
            if (p * attackerTurn > 0) {
                const kind = Math.abs(p);
                const dirs = DIRS[kind];
                for (let d of dirs) {
                    const r_dy = (attackerTurn === 1) ? d[0] : -d[0];
                    const r_dx = (attackerTurn === 1) ? d[1] : -d[1];
                    const cy = Math.floor(i / 3), cx = i % 3;
                    const ty = cy + r_dy, tx = cx + r_dx;
                    if (ty >= 0 && ty < 4 && tx >= 0 && tx < 3) {
                        if ((ty * 3 + tx) === targetIdx) return true;
                    }
                }
            }
        }
        return false;
    }
}