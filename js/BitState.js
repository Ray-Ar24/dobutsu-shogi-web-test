import { HIYOKO, KIRIN, ZOU, LION, NIWATORI, SENTE_TRY_MASK, GOTE_TRY_MASK, SENTE_PROMOTE_MASK, GOTE_PROMOTE_MASK } from './constants.js';

// 事前計算テーブル（移動可能範囲）
const MOVES_TABLE = (() => {
    const table = {
        [HIYOKO]: [], [KIRIN]: [], [ZOU]: [], [LION]: [], [NIWATORI]: []
    };
    // Sente基準 (Goteは反転して使用)
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
        // ビットボード: 各駒種の配置をビット(12bit)で保持
        // [0]:Sente, [1]:Gote
        // bitPieces[turn][kind] = bitmask
        this.bitPieces = [
            [0, 0, 0, 0, 0, 0], // Sente (Empty, H, K, Z, L, N)
            [0, 0, 0, 0, 0, 0]  // Gote
        ];
        
        // 持ち駒 (整数カウント)
        // [0]:Sente, [1]:Gote
        // hands[turn][kind] = count
        this.hands = [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0]
        ];

        this.turn = 0; // 0: Sente, 1: Gote
        this.turnSign = 1; // 1: Sente, -1: Gote
        this.moveCount = 0;

        // 初期配置
        this.reset();
    }

    reset() {
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
    }

    clone() {
        const c = new BitState();
        // 配列の中身をコピー
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

    // --- UI連携用ヘルパー ---
    // 旧GameState.board (配列) 形式で返す
    getBoardArray() {
        const board = new Int8Array(12).fill(0);
        for (let t = 0; t < 2; t++) {
            const sign = (t === 0) ? 1 : -1;
            for (let k = 1; k <= 5; k++) {
                let mask = this.bitPieces[t][k];
                while (mask > 0) {
                    // 最下位ビットを取り出す (LSB)
                    const bit = mask & -mask;
                    const idx = 31 - Math.clz32(bit); // log2(bit)
                    board[idx] = k * sign;
                    mask ^= bit; // clear bit
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
        // 定石照合用: 高速化のため主要ビットのみでキー生成
        // (厳密には持ち駒も含めるべきだが、定石範囲内なら盤面だけでほぼ特定可能)
        // 念のため完全な情報を文字列化
        return this.getBoardArray().join(",") + "|" + this.turnSign;
    }

    // --- ロジック ---

    // 占有ビットマップ取得
    getOccupied(t) {
        return this.bitPieces[t][1] | this.bitPieces[t][2] | this.bitPieces[t][3] | 
               this.bitPieces[t][4] | this.bitPieces[t][5];
    }

    getValidMoves() {
        const moves = [];
        const t = this.turn;
        const opp = t ^ 1; // 相手
        
        const myOcc = this.getOccupied(t);
        const oppOcc = this.getOccupied(opp);
        const allOcc = myOcc | oppOcc;
        const empty = (~allOcc) & 0xFFF; // 12bit mask

        // 1. 盤上の移動
        for (let k = 1; k <= 5; k++) {
            let pieces = this.bitPieces[t][k];
            while (pieces > 0) {
                const bit = pieces & -pieces;
                const src = 31 - Math.clz32(bit);
                pieces ^= bit;

                // 移動可能範囲
                let attacks = MOVES_TABLE[k][src];
                
                // 後手番なら180度回転した動きにする必要があるが、
                // 事前計算テーブルは先手用。
                // Bitboardでは「盤面を回転」させるより「移動先を反転」させる等の処理が必要。
                // ここではシンプルに、後手番の場合はMoveTableを「点対称の位置」で参照し、結果も点対称にするアプローチをとる。
                // 11 - src が点対称の位置。
                if (t === 1) {
                    // 後手: (11-src)の位置にある先手駒の動きを取得し、その結果を反転(11-dst)させる
                    // これで後手の動きになる
                    const revSrc = 11 - src;
                    // 先手として動ける範囲
                    let revAttacks = MOVES_TABLE[k][revSrc];
                    // 反転して後手の攻撃範囲に戻す
                    // ビット反転: 12bit空間での反転は少し重いが、ループよりマシ
                    // 単純な実装:
                    attacks = 0;
                    while(revAttacks > 0) {
                        const rBit = revAttacks & -revAttacks;
                        const rIdx = 31 - Math.clz32(rBit);
                        attacks |= (1 << (11 - rIdx));
                        revAttacks ^= rBit;
                    }
                }

                // 自駒がいる場所には移動不可
                let valid = attacks & (~myOcc);

                while (valid > 0) {
                    const dstBit = valid & -valid;
                    const dst = 31 - Math.clz32(dstBit);
                    valid ^= dstBit;

                    // 成り判定
                    let promote = false;
                    if (k === HIYOKO) {
                        if (t === 0 && (dstBit & SENTE_PROMOTE_MASK)) promote = true;
                        if (t === 1 && (dstBit & GOTE_PROMOTE_MASK)) promote = true;
                    }

                    // Moveオブジェクト: {type:0(move)|1(drop), src, dst, promote}
                    // 高速化のためプレーンなオブジェクトを使用
                    moves.push({ type: 0, src: src, dst: dst, promote: promote });
                }
            }
        }

        // 2. 持ち駒を打つ
        // 持ち駒がある種類について
        let handKinds = 0;
        for(let k=1; k<=5; k++) if(this.hands[t][k] > 0) handKinds |= (1<<k);

        if (handKinds > 0) {
            // 空きマスすべてに打てる
            let e = empty;
            while (e > 0) {
                const dstBit = e & -e;
                const dst = 31 - Math.clz32(dstBit);
                e ^= dstBit;

                for (let k = 1; k <= 5; k++) {
                    if ((handKinds >> k) & 1) {
                        // 打ち歩詰め等の禁じ手はないが、行き所のないヒヨコは禁止
                        if (k === HIYOKO) {
                            if (t === 0 && (dstBit & SENTE_PROMOTE_MASK)) continue;
                            if (t === 1 && (dstBit & GOTE_PROMOTE_MASK)) continue;
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

            // 元の場所から消す
            // 何の駒だったか特定
            let kind = 0;
            for(let k=1; k<=5; k++) {
                if (next.bitPieces[t][k] & srcBit) {
                    kind = k;
                    next.bitPieces[t][k] ^= srcBit;
                    break;
                }
            }

            // 相手の駒を取る処理
            if (next.getOccupied(opp) & dstBit) {
                for(let k=1; k<=5; k++) {
                    if (next.bitPieces[opp][k] & dstBit) {
                        next.bitPieces[opp][k] ^= dstBit;
                        // 自分の持ち駒へ (成り駒は戻る)
                        const rawKind = (k === NIWATORI) ? HIYOKO : k;
                        next.hands[t][rawKind]++;
                        break;
                    }
                }
            }

            // 新しい場所へ
            const newKind = move.promote ? NIWATORI : kind;
            next.bitPieces[t][newKind] |= dstBit;

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

    // 勝敗判定: {over: bool, winner: 1(Sente)|-1(Gote)|0}
    isGameOver() {
        const sLion = this.bitPieces[0][LION];
        const gLion = this.bitPieces[1][LION];

        if (sLion === 0) return { over: true, winner: -1 };
        if (gLion === 0) return { over: true, winner: 1 };

        // トライルール
        // 先手ライオンが奥(0,1,2)にいる
        if (sLion & SENTE_PROMOTE_MASK) {
            // 先手番なら勝ち確定 (トライ成功)
            // もし今が後手番なら、先手がトライした直後なので、
            // 後手がこのライオンを取れなければ先手の勝ち
            // 単純化: トライエリアに入った状態で手番が回ってきたら勝ちと判定せず、
            // 「トライした瞬間」に「取られなければ勝ち」と判定するロジックが必要だが、
            // 動物将棋のルールでは「トライして次の相手の手で取られなければ勝ち」
            // ここでは「トライエリアにいて、かつ取られていない」＝勝ちとみなす
            // ※厳密にはisAttacked判定が必要
            if (this.turn === 0) return { over: true, winner: 1 }; // 既に入っていて手番が回ってきた
            if (!this.isAttacked(Math.log2(sLion), 1)) return { over: true, winner: 1 };
        }
        
        if (gLion & GOTE_PROMOTE_MASK) {
            if (this.turn === 1) return { over: true, winner: -1 };
            if (!this.isAttacked(Math.log2(gLion), 0)) return { over: true, winner: -1 };
        }

        return { over: false, winner: 0 };
    }

    // targetIdxに attackerTurn (0 or 1) の駒が利いているか
    isAttacked(targetIdx, attackerTurn) {
        // 逆転の発想: targetIdxに各駒種の動きを適用し、そこにattackerの該当駒があれば利いている
        // ただしヒヨコは不可逆なので注意。
        // ここでは愚直に全attacker駒の利きを調べる方がBitboardでは楽かも（popCountが少ないので）
        
        const attPieces = this.bitPieces[attackerTurn];
        
        // attackerがSente(0)なら、通常テーブル
        // attackerがGote(1)なら、反転テーブル
        
        for (let k = 1; k <= 5; k++) {
            let pieces = attPieces[k];
            while (pieces > 0) {
                const bit = pieces & -pieces;
                const src = 31 - Math.clz32(bit);
                pieces ^= bit;

                let attacks = MOVES_TABLE[k][src];
                if (attackerTurn === 1) {
                    // 後手番の動き変換
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

                if ((attacks >> targetIdx) & 1) return true;
            }
        }
        return false;
    }
}
