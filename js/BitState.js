import { HIYOKO, KIRIN, ZOU, LION, NIWATORI, SENTE_PROMOTE_MASK, GOTE_PROMOTE_MASK } from './constants.js';

// 事前計算テーブル（移動可能範囲）
const MOVES_TABLE = (() => {
    const table = {
        [HIYOKO]: [], [KIRIN]: [], [ZOU]: [], [LION]: [], [NIWATORI]: []
    };
    // Sente基準 (Goteはロジックで反転)
    const dirs = {
        [HIYOKO]: [[-1, 0]],
        [KIRIN]: [[-1, 0], [1, 0], [0, -1], [0, 1]],
        [ZOU]: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
        [LION]: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
        [NIWATORI]: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]]
    };

    for (let kind = 1; kind <= 5; kind++) {
        for (let i = 0; i < 12; i++) {
            let mask = 0;
            const cx = i % 3;
            const cy = Math.floor(i / 3);
            
            for (let [dy, dx] of dirs[kind]) {
                const ny = cy + dy;
                const nx = cx + dx;
                if (nx >= 0 && nx < 3 && ny >= 0 && ny < 4) {
                    mask |= (1 << (ny * 3 + nx));
                }
            }
            table[kind][i] = mask;
        }
    }
    return table;
})();

export class BitState {
    constructor() {
        // [0]:Sente, [1]:Gote
        this.bitPieces = [
            [0, 0, 0, 0, 0, 0], // Sente (Empty, H, K, Z, L, N)
            [0, 0, 0, 0, 0, 0]  // Gote
        ];
        this.hands = [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0]
        ];
        this.turn = 0; // 0: Sente, 1: Gote
        this.turnSign = 1; // 1: Sente, -1: Gote
        this.moveCount = 0;
        this.reset();
    }

    reset() {
        this.bitPieces = [[0,0,0,0,0,0], [0,0,0,0,0,0]];
        this.hands = [[0,0,0,0,0,0], [0,0,0,0,0,0]];
        
        // Sente
        this.bitPieces[0][KIRIN] = (1 << 11); // C4
        this.bitPieces[0][LION]  = (1 << 10); // B4
        this.bitPieces[0][ZOU]   = (1 << 9);  // A4
        this.bitPieces[0][HIYOKO]= (1 << 7);  // B3

        // Gote
        this.bitPieces[1][ZOU]   = (1 << 2);  // C1
        this.bitPieces[1][LION]  = (1 << 1);  // B1
        this.bitPieces[1][KIRIN] = (1 << 0);  // A1
        this.bitPieces[1][HIYOKO]= (1 << 4);  // B2
        
        this.turn = 0;
        this.turnSign = 1;
        this.moveCount = 0;
    }

    clone() {
        const c = new BitState();
        for(let t=0; t<2; t++) {
            for(let k=0; k<=5; k++) {
                c.bitPieces[t][k] = this.bitPieces[t][k];
                c.hands[t][k] = this.hands[t][k];
            }
        }
        c.turn = this.turn;
        c.turnSign = this.turnSign;
        c.moveCount = this.moveCount;
        return c;
    }

    // UI連携用: 配列形式で盤面を返す
    getBoardArray() {
        const board = new Int8Array(12).fill(0);
        for (let t = 0; t < 2; t++) {
            const sign = (t === 0) ? 1 : -1;
            for (let k = 1; k <= 5; k++) {
                let mask = this.bitPieces[t][k];
                while (mask > 0) {
                    const bit = mask & -mask;
                    const idx = 31 - Math.clz32(bit);
                    board[idx] = k * sign;
                    mask ^= bit;
                }
            }
        }
        return board;
    }

    getHandsList(sign) {
        const t = (sign === 1) ? 0 : 1;
        const list = [];
        for (let k = 1; k <= 5; k++) {
            for (let c = 0; c < this.hands[t][k]; c++) list.push(k);
        }
        return list;
    }

    toStringKey() {
        return this.getBoardArray().join(",") + "|" + this.turnSign;
    }

    getOccupied(t) {
        return this.bitPieces[t][1] | this.bitPieces[t][2] | this.bitPieces[t][3] | 
               this.bitPieces[t][4] | this.bitPieces[t][5];
    }

    getValidMoves() {
        const moves = [];
        const t = this.turn;
        
        const myOcc = this.getOccupied(t);
        const oppOcc = this.getOccupied(t ^ 1);
        const empty = (~(myOcc | oppOcc)) & 0xFFF;

        // 1. 盤上の移動
        for (let k = 1; k <= 5; k++) {
            let pieces = this.bitPieces[t][k];
            while (pieces > 0) {
                const bit = pieces & -pieces;
                const src = 31 - Math.clz32(bit);
                pieces ^= bit;

                let attacks = MOVES_TABLE[k][src];
                if (t === 1) { // 後手番なら反転ロジック
                    const revSrc = 11 - src;
                    let revAttacks = MOVES_TABLE[k][revSrc];
                    attacks = 0;
                    while(revAttacks > 0) {
                        const rBit = revAttacks & -revAttacks;
                        const rIdx = 31 - Math.clz32(rBit);
                        attacks |= (1 << (11 - rIdx));
                        revAttacks ^= rBit;
                    }
                }

                let valid = attacks & (~myOcc);
                while (valid > 0) {
                    const dstBit = valid & -valid;
                    const dst = 31 - Math.clz32(dstBit);
                    valid ^= dstBit;

                    let promote = false;
                    if (k === HIYOKO) {
                        if ((t === 0 && (dstBit & SENTE_PROMOTE_MASK)) ||
                            (t === 1 && (dstBit & GOTE_PROMOTE_MASK))) promote = true;
                    }
                    // type: 0=MOVE, 1=DROP
                    moves.push({ type: 0, src: src, dst: dst, promote: promote });
                }
            }
        }

        // 2. 持ち駒
        let handKinds = 0;
        for(let k=1; k<=5; k++) if(this.hands[t][k] > 0) handKinds |= (1<<k);

        if (handKinds > 0) {
            let e = empty;
            while (e > 0) {
                const dstBit = e & -e;
                const dst = 31 - Math.clz32(dstBit);
                e ^= dstBit;

                for (let k = 1; k <= 5; k++) {
                    if ((handKinds >> k) & 1) {
                        // 行き所のないヒヨコ禁止
                        if (k === HIYOKO) {
                            if ((t === 0 && (dstBit & SENTE_PROMOTE_MASK)) ||
                                (t === 1 && (dstBit & GOTE_PROMOTE_MASK))) continue;
                        }
                        moves.push({ type: 1, src: k, dst: dst, promote: false });
                    }
                }
            }
        }
        return moves;
    }

    makeMove(move) {
        const next = this.clone();
        const t = next.turn;
        const opp = t ^ 1;

        if (move.type === 0) { // MOVE
            const srcBit = (1 << move.src);
            const dstBit = (1 << move.dst);

            // 元の場所から削除
            for(let k=1; k<=5; k++) {
                if (next.bitPieces[t][k] & srcBit) {
                    next.bitPieces[t][k] ^= srcBit;
                    // 移動先へ (成る場合はNIWATORI)
                    const newKind = move.promote ? NIWATORI : k;
                    next.bitPieces[t][newKind] |= dstBit;
                    break;
                }
            }

            // 相手の駒を取る
            if (next.getOccupied(opp) & dstBit) {
                for(let k=1; k<=5; k++) {
                    if (next.bitPieces[opp][k] & dstBit) {
                        next.bitPieces[opp][k] ^= dstBit;
                        // 自分の持ち駒へ
                        const rawKind = (k === NIWATORI) ? HIYOKO : k;
                        next.hands[t][rawKind]++;
                        break;
                    }
                }
            }
        } else { // DROP
            const dstBit = (1 << move.dst);
            next.hands[t][move.src]--;
            next.bitPieces[t][move.src] |= dstBit;
        }

        next.turn = opp;
        next.turnSign = -next.turnSign;
        next.moveCount++;
        return next;
    }

    isGameOver() {
        const sLion = this.bitPieces[0][LION];
        const gLion = this.bitPieces[1][LION];

        if (sLion === 0) return { over: true, winner: -1 };
        if (gLion === 0) return { over: true, winner: 1 };

        // トライルール (簡易判定: トライエリアにライオンがいて、次の手番が相手なら、
        // 直前の自分の手でトライが成立して取られなかったとみなせるため勝ち)
        // ※厳密にはisAttackedチェックを入れるが、MCTS上ではこの簡易判定でも強い
        if ((sLion & SENTE_PROMOTE_MASK) && this.turn === 0) return { over: true, winner: 1 };
        if ((gLion & GOTE_PROMOTE_MASK) && this.turn === 1) return { over: true, winner: -1 };

        return { over: false, winner: 0 };
    }
}
