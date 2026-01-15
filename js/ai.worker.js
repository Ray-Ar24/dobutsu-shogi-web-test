import { GameState } from './GameState.js';
import { MCTSNode } from './MCTSNode.js';
import { buildOpeningBook } from './OpeningBook.js';
import { LION, PIECE_VALUES } from './constants.js';

// 起動時に定石を構築
const OPENING_BOOK = buildOpeningBook();
let currentSessionId = 0;

self.onmessage = function(e) {
    const data = e.data;
    if (data.type === 'START') {
        const { rootBoard, rootHands, rootTurn, durationSec, sessionId } = data;
        currentSessionId = sessionId;
        
        // メインスレッドから送られたデータでGameStateを復元
        const rootState = new GameState();
        rootState.board = rootBoard;
        rootState.hands = rootHands;
        rootState.turn = rootTurn;
        
        // 1. 定石チェック
        const boardKey = rootState.toStringKey(); 
        if (OPENING_BOOK[boardKey]) {
            const bookMove = OPENING_BOOK[boardKey];
            self.postMessage({ 
                type: 'FINISH', 
                move: bookMove, 
                sims: 9999, 
                winRate: 0.55, 
                turn: rootState.turn 
            });
            return;
        }

        // 2. 詰み探索 (5手)
        const mate = solveMate(rootState, 5);
        if (mate.win && mate.move) {
            self.postMessage({ 
                type: 'FINISH', 
                move: mate.move, 
                sims: 99999, 
                winRate: 1.0, 
                turn: rootState.turn 
            });
            return;
        }

        // 3. MCTS開始
        search(rootState, durationSec, sessionId);

    } else if (data.type === 'CANCEL') {
        currentSessionId = -1;
    }
};

// --- 詰み探索関数 ---
function solveMate(state, depth) {
    const res = state.isGameOver();
    if (res.over) {
        // 現在の手番プレイヤーが負け（直前のプレイヤーが勝ち）ならTrue
        return { win: res.winner !== 0 && res.winner !== state.turn, move: null };
    }
    if (depth <= 0) return { win: false, move: null };

    const moves = state.getValidMoves();
    
    // ORノード
    for (let m of moves) {
        const next = state.makeMove(m);
        // 相手が勝てないなら、自分は勝ち
        if (!solveMateOpponent(next, depth - 1)) {
            return { win: true, move: m };
        }
    }
    return { win: false, move: null };
}

function solveMateOpponent(state, depth) {
    const res = state.isGameOver();
    if (res.over) {
        return res.winner !== 0 && res.winner !== state.turn;
    }
    if (depth <= 0) return true; // 詰み不明なら「逃げ切れるかも」として扱う

    const moves = state.getValidMoves();
    if (moves.length === 0) return false; // 指す手なし＝負け

    for (let m of moves) {
        const next = state.makeMove(m);
        // 相手（自分から見て）が勝つルートがあるか？
        const result = solveMate(next, depth - 1);
        if (!result.win) {
            // 自分が勝てないルートが一つでもあるなら、相手はそこに逃げる
            return true;
        }
    }
    return false; // 全ての逃げ道が塞がれている
}

// --- MCTS Search ---
function search(rootState, durationSec, sessionId) {
    try {
        const root = new MCTSNode(rootState);
        const startTime = performance.now();
        const endTime = startTime + durationSec * 1000;
        let sims = 0;

        function runLoop() {
            if (currentSessionId !== sessionId) return;

            const now = performance.now();
            if (now >= endTime) {
                finalize(root, sims);
                return;
            }

            const BATCH_SIZE = 1000;
            for(let i=0; i<BATCH_SIZE; i++) {
                step(root);
                sims++;
            }

            if (sims % 5000 === 0) {
                self.postMessage({ type: 'PROGRESS', sims });
            }
            setTimeout(runLoop, 0);
        }
        runLoop();

    } catch (e) {
        self.postMessage({ type: 'ERROR', msg: e.toString() });
    }
}

function step(root) {
    let node = root;
    // Selection
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
        let best = node.children[0], maxUcb = -Infinity;
        const total = node.visits;
        for (let c of node.children) {
            const u = c.ucb(total);
            if (u > maxUcb) { maxUcb = u; best = c; }
        }
        node = best;
    }
    // Expansion
    if (node.untriedMoves.length > 0 && !node.state.isGameOver().over) {
        const idx = Math.floor(Math.random() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(idx, 1)[0];
        const nextState = node.state.makeMove(move);
        const child = new MCTSNode(nextState, node, move);
        node.children.push(child);
        node = child;
    }
    // Simulation (Smart Play)
    let curr = node.state.clone();
    let winner = 0;
    
    for (let i = 0; i < 120; i++) {
        const res = curr.isGameOver();
        if (res.over) { winner = res.winner; break; }
        
        const moves = curr.getValidMoves();
        if (moves.length === 0) { winner = 0; break; }
        
        // 必勝手（王取り・トライ）チェック
        let winningMove = null;
        for (let j = 0; j < moves.length; j++) {
            const m = moves[j];
            if (m.type === 'MOVE') {
                if (Math.abs(curr.board[m.dst]) === LION) {
                    winningMove = m; break;
                }
                if (Math.abs(curr.board[m.src]) === LION) {
                     const ty = Math.floor(m.dst/3);
                     if ((curr.turn === 1 && ty === 0) || (curr.turn === -1 && ty === 3)) {
                         winningMove = m; break;
                     }
                }
            }
        }

        if (winningMove) {
            curr = curr.makeMove(winningMove);
            continue;
        }

        // 重み付けランダム
        let bestM = moves[0];
        let candidates = [];
        let totalW = 0;
        for (let j = 0; j < moves.length; j++) {
            const m = moves[j];
            let w = 10;
            if (m.type === 'MOVE') {
                const target = curr.board[m.dst];
                if (target !== 0) w += PIECE_VALUES[Math.abs(target)];
                // トライ狙い
                if (Math.abs(curr.board[m.src]) === LION) {
                     const ty = Math.floor(m.dst/3);
                     if ((curr.turn === 1 && ty === 0) || (curr.turn === -1 && ty === 3)) w += 2000;
                }
            }
            candidates.push({m, w});
            totalW += w;
        }

        let r = Math.random() * totalW;
        for (let c of candidates) {
            r -= c.w;
            if (r <= 0) {
                bestM = c.m;
                break;
            }
        }
        curr = curr.makeMove(bestM);
    }
    
    // Backpropagation
    let bp = node;
    while (bp) {
        bp.visits++;
        if (bp.parent) {
            const pTurn = bp.parent.state.turn;
            let reward = (winner === pTurn) ? 1.0 : (winner === 0 ? 0.5 : 0);
            bp.wins += reward;
        }
        bp = bp.parent;
    }
}

function finalize(root, sims) {
    let bestNode = null, maxV = -1, bestRate = 0.5;
    if (root.children) {
        for (let c of root.children) {
            if (c.visits > maxV) { maxV = c.visits; bestNode = c; bestRate = c.wins/c.visits; }
        }
    }
    self.postMessage({ 
        type: 'FINISH', 
        move: bestNode ? bestNode.move : null, 
        sims, 
        winRate: bestRate, 
        turn: root.state.turn 
    });
}