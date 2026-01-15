import { BitState } from './BitState.js'; // BitStateを使用
import { buildOpeningBook } from './OpeningBook.js';
import { LION, HIYOKO, KIRIN, ZOU, NIWATORI } from './constants.js';

// 初期化
let OPENING_BOOK = null;
let currentSessionId = 0;

// 重み付け係数 (解析論文参考)
const WEIGHTS = {
    PIECE: { [HIYOKO]: 10, [KIRIN]: 40, [ZOU]: 40, [LION]: 1000, [NIWATORI]: 50 },
    CAPTURE: 50,   // 駒を取るボーナス
    PROMOTE: 30,   // 成りボーナス
    TRY: 2000,     // トライボーナス
    CHECK: 100     // 王手ボーナス（疑似）
};

self.onmessage = function(e) {
    const data = e.data;
    
    if (data.type === 'START') {
        const { rootBoard, rootHands, rootTurn, durationSec, sessionId } = data;
        currentSessionId = sessionId;

        // 定石構築 (初回のみ)
        if (!OPENING_BOOK) OPENING_BOOK = buildOpeningBook();

        // 配列からBitStateへ変換して復元
        const rootState = restoreState(rootBoard, rootHands, rootTurn);

        // 1. 定石チェック
        const key = rootState.toStringKey();
        if (OPENING_BOOK[key]) {
            self.postMessage({ type: 'FINISH', move: OPENING_BOOK[key], sims: 9999, winRate: 0.55, turn: rootTurn });
            return;
        }

        // 2. 詰み探索 (3手) - BitStateで高速化
        const mate = solveMate(rootState, 3);
        if (mate.win) {
            self.postMessage({ type: 'FINISH', move: mate.move, sims: 99999, winRate: 1.0, turn: rootTurn });
            return;
        }

        // 3. Flat Monte Carlo (Weighted)
        search(rootState, durationSec);

    } else if (data.type === 'CANCEL') {
        currentSessionId = -1;
    }
};

// 配列データからBitStateを復元するヘルパー
function restoreState(boardArr, handsArr, turnSign) {
    const state = new BitState();
    state.reset(); // clear default
    // Clear all
    for(let t=0; t<2; t++) {
        state.bitPieces[t].fill(0);
        state.hands[t].fill(0);
    }
    
    // Board
    for(let i=0; i<12; i++) {
        const p = boardArr[i];
        if (p !== 0) {
            const t = (p > 0) ? 0 : 1;
            const k = Math.abs(p);
            state.bitPieces[t][k] |= (1 << i);
        }
    }
    // Hands
    // handsArrは [0..5]が先手, [6..11]が後手
    for(let k=1; k<=5; k++) {
        state.hands[0][k] = handsArr[k]; // 先手
        state.hands[1][k] = handsArr[6+k]; // 後手 (offset 6)
    }
    
    state.turn = (turnSign === 1) ? 0 : 1;
    state.turnSign = turnSign;
    return state;
}

// --- 詰み探索 ---
function solveMate(state, depth) {
    const res = state.isGameOver();
    if (res.over) return { win: res.winner !== 0 && res.winner !== state.turnSign, move: null };
    if (depth <= 0) return { win: false, move: null };

    const moves = state.getValidMoves();
    for (let m of moves) {
        const next = state.makeMove(m);
        // 相手が全応手で負けるか？
        if (solveMateOpponent(next, depth - 1)) {
            return { win: true, move: m };
        }
    }
    return { win: false };
}

function solveMateOpponent(state, depth) {
    const res = state.isGameOver();
    if (res.over) return res.winner !== 0 && res.winner !== state.turnSign; // 自分が勝ちならtrue
    if (depth <= 0) return false; // 詰み不明

    const moves = state.getValidMoves();
    if (moves.length === 0) return true; // 相手手なし＝勝ち

    for (let m of moves) {
        const next = state.makeMove(m);
        const res = solveMate(next, depth - 1);
        if (!res.win) return false; // 相手が逃げ切れるルートがある
    }
    return true; // 全てのルートで自分が勝つ
}

// --- Flat Monte Carlo Search ---
function search(rootState, durationSec) {
    const moves = rootState.getValidMoves();
    if (moves.length === 0) {
        self.postMessage({ type: 'FINISH', move: null, sims: 0, winRate: 0, turn: rootState.turnSign });
        return;
    }

    // 統計情報
    const stats = moves.map(m => ({ move: m, wins: 0, visits: 0 }));
    
    const startTime = performance.now();
    const endTime = startTime + durationSec * 1000;
    let totalSims = 0;

    // バッチ処理ループ
    function runLoop() {
        if (currentSessionId === -1) return;

        const now = performance.now();
        if (now >= endTime) {
            // 最多訪問(ここでは純粋な勝率が良い)手を選ぶ
            let bestIdx = 0;
            let maxRate = -1;
            for(let i=0; i<stats.length; i++) {
                const rate = stats[i].visits > 0 ? stats[i].wins / stats[i].visits : 0;
                if (rate > maxRate) { maxRate = rate; bestIdx = i; }
            }
            
            self.postMessage({
                type: 'FINISH',
                move: stats[bestIdx].move,
                sims: totalSims,
                winRate: maxRate,
                turn: rootState.turnSign
            });
            return;
        }

        // 各候補手に対して数回ずつプレイアウトを実行
        const BATCH = 50; 
        for (let i = 0; i < BATCH; i++) {
            // 現在、最も期待値が高い手か、試行回数が少ない手を選ぶ (簡易UCB的選択)
            let selectedIdx = 0;
            let maxScore = -1;
            for(let j=0; j<stats.length; j++) {
                // 簡易スコア: 勝率 + 探索ボーナス
                let score = 1e9;
                if (stats[j].visits > 0) {
                    score = (stats[j].wins / stats[j].visits) + Math.sqrt(2 * Math.log(totalSims + 1) / stats[j].visits);
                }
                if (score > maxScore) { maxScore = score; selectedIdx = j; }
            }

            // 1手進める
            const firstMove = stats[selectedIdx].move;
            let curr = rootState.makeMove(firstMove);
            
            // 重み付けプレイアウト (Weighted Rollout)
            let winner = 0;
            const myTurnSign = rootState.turnSign; // AIの手番

            for (let depth = 0; depth < 60; depth++) { // 深さ制限
                const res = curr.isGameOver();
                if (res.over) { winner = res.winner; break; }

                const nextMoves = curr.getValidMoves();
                if (nextMoves.length === 0) { winner = 0; break; }

                // --- 重み付け抽選 ---
                // Moveの良さを計算
                let weights = [];
                let totalW = 0;
                
                // 現在の盤面情報取得 (Bitboardから情報を取り出すのは少しコストだが、精度のため)
                const boardArr = curr.getBoardArray(); // 簡易取得

                for (let m of nextMoves) {
                    let w = 10; // 基礎点
                    
                    if (m.type === 0) { // MOVE
                        const target = boardArr[m.dst];
                        if (target !== 0) w += WEIGHTS.PIECE[Math.abs(target)] + WEIGHTS.CAPTURE;
                        if (m.promote) w += WEIGHTS.PROMOTE;
                        
                        // トライ (ライオンが敵陣へ)
                        const srcPiece = boardArr[m.src]; // 移動前の駒
                        // (注意: makeMove前のboardArrなのでsrcにある)
                        if (Math.abs(srcPiece) === LION) {
                            const ty = Math.floor(m.dst / 3);
                            const tSign = curr.turnSign;
                            if ((tSign === 1 && ty === 0) || (tSign === -1 && ty === 3)) w += WEIGHTS.TRY;
                        }
                    } else { // DROP
                        // 守りの手などは評価しにくいが、基礎点で
                        // 王手になる場所へのDropなどはボーナスつけたいが計算重いので省略
                    }
                    
                    weights.push(w);
                    totalW += w;
                }

                // ルーレット選択
                let r = Math.random() * totalW;
                let selectedMove = nextMoves[0];
                for (let k = 0; k < weights.length; k++) {
                    r -= weights[k];
                    if (r <= 0) { selectedMove = nextMoves[k]; break; }
                }

                curr = curr.makeMove(selectedMove);
            }

            // 結果記録
            stats[selectedIdx].visits++;
            if (winner === myTurnSign) stats[selectedIdx].wins += 1;
            else if (winner === 0) stats[selectedIdx].wins += 0.5;
            
            totalSims++;
        }

        if (totalSims % 1000 === 0) {
            self.postMessage({ type: 'PROGRESS', sims: totalSims });
        }
        setTimeout(runLoop, 0);
    }
    runLoop();
}
