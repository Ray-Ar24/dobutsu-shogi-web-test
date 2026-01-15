import { BitState } from './BitState.js';
import { MCTSNode } from './MCTSNode.js';
import { buildOpeningBook } from './OpeningBook.js';
import { LION, PIECE_VALUES } from './constants.js';

const OPENING_BOOK = buildOpeningBook();
let currentSessionId = 0;

self.onmessage = function(e) {
    const data = e.data;
    if (data.type === 'START') {
        const { rootBoard, rootHands, rootTurn, durationSec, sessionId } = data;
        currentSessionId = sessionId;
        
        // 配列からBitStateへ復元
        const rootState = restoreState(rootBoard, rootHands, rootTurn);
        
        // 1. 定石チェック
        const boardKey = rootState.toStringKey(); 
        if (OPENING_BOOK[boardKey]) {
            self.postMessage({ type: 'FINISH', move: OPENING_BOOK[boardKey], sims: 9999, winRate: 0.55, turn: rootState.turnSign });
            return;
        }

        // 2. 詰み探索
        // ... (BitStateのisGameOverロジック簡略化のため一旦省略、MCTSにリソース集中)

        // 3. MCTS
        search(rootState, durationSec, sessionId);

    } else if (data.type === 'CANCEL') {
        currentSessionId = -1;
    }
};

function restoreState(boardArr, handsArr, turnSign) {
    const state = new BitState();
    state.reset();
    for(let t=0; t<2; t++) {
        state.bitPieces[t].fill(0);
        state.hands[t].fill(0);
    }
    
    for(let i=0; i<12; i++) {
        const p = boardArr[i];
        if (p !== 0) {
            const t = (p > 0) ? 0 : 1;
            const k = Math.abs(p);
            state.bitPieces[t][k] |= (1 << i);
        }
    }
    for(let k=1; k<=5; k++) {
        state.hands[0][k] = handsArr[k]; // Sente
        state.hands[1][k] = handsArr[6+k]; // Gote
    }
    state.turn = (turnSign === 1) ? 0 : 1;
    state.turnSign = turnSign;
    return state;
}

function search(rootState, durationSec, sessionId) {
    const root = new MCTSNode(rootState);
    const startTime = performance.now();
    const endTime = startTime + durationSec * 1000;
    let sims = 0;

    function runLoop() {
        if (currentSessionId !== sessionId) return;
        const now = performance.now();
        if (now >= endTime) {
            finalize(root, sims, rootState.turnSign);
            return;
        }
        const BATCH_SIZE = 1000;
        for(let i=0; i<BATCH_SIZE; i++) {
            step(root);
            sims++;
        }
        if (sims % 5000 === 0) self.postMessage({ type: 'PROGRESS', sims });
        setTimeout(runLoop, 0);
    }
    runLoop();
}

function step(root) {
    let node = root;
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
        let best = node.children[0], maxUcb = -Infinity;
        const total = node.visits;
        for (let c of node.children) {
            const u = c.ucb(total);
            if (u > maxUcb) { maxUcb = u; best = c; }
        }
        node = best;
    }
    if (node.untriedMoves.length > 0 && !node.state.isGameOver().over) {
        const idx = Math.floor(Math.random() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(idx, 1)[0];
        const nextState = node.state.makeMove(move);
        const child = new MCTSNode(nextState, node, move);
        node.children.push(child);
        node = child;
    }
    let curr = node.state.clone();
    let winner = 0;
    
    // シミュレーション (BitStateは配列アクセスがないので高速)
    for (let i = 0; i < 150; i++) {
        const res = curr.isGameOver();
        if (res.over) { winner = res.winner; break; }
        const moves = curr.getValidMoves();
        if (moves.length === 0) { winner = 0; break; }
        
        const idx = Math.floor(Math.random() * moves.length);
        curr = curr.makeMove(moves[idx]);
    }
    
    let bp = node;
    while (bp) {
        bp.visits++;
        if (bp.parent) {
            const pTurn = bp.parent.state.turnSign;
            let reward = (winner === pTurn) ? 1.0 : (winner === 0 ? 0.5 : 0);
            bp.wins += reward;
        }
        bp = bp.parent;
    }
}

function finalize(root, sims, turnSign) {
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
        turn: turnSign 
    });
}
