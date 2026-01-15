import { BitState } from './BitState.js';

// 定石ライン
const OPENING_LINES = [
    [[11,8], [0,3], [7,4], [3,4], [9,5], [2,6]],
    [[7,4], [0,4]],
    [[9,6], [2,5], [11,8], [0,3]],
    [[11,8], [0,3], [10,11], [1,0]], 
    [[9,6], [0,3], [6,4], [3,4]],
    [[11,8], [4,7], [8,7]],
    [[9,6], [2,5], [7,4], [5,4]],
    [[11,8], [2,5], [7,4], [5,4]],
    [[10,6], [0,3]],
    [[10,8], [2,5]],
    [[11,8], [0,3], [10,11], [3,6]],
    [[9,6], [2,5], [6,3], [5,8]],
    [[9,6], [0,3], [6,9], [3,0]]
];

export function buildOpeningBook() {
    const book = {};
    const rootState = new BitState();
    
    OPENING_LINES.forEach(line => {
        let state = rootState.clone();
        for (let pair of line) {
            const src = pair[0];
            const dst = pair[1];
            
            const key = state.toStringKey();
            const validMoves = state.getValidMoves();
            // BitStateのMoveは type:0=MOVE
            const move = validMoves.find(m => m.type === 0 && m.src === src && m.dst === dst);
            
            if (move) {
                if (!book[key]) book[key] = move;
                state = state.makeMove(move);
            } else {
                break;
            }
        }
    });
    return book;
}
