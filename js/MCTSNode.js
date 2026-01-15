export class MCTSNode {
    constructor(state, parent=null, move=null) {
        this.state = state;
        this.parent = parent;
        this.move = move;
        this.children = [];
        this.wins = 0.0;
        this.visits = 0;
        this.untriedMoves = state.getValidMoves();
    }
    
    ucb(totalVisits) {
        if (this.visits === 0) return Infinity;
        return (this.wins / this.visits) + 1.41 * Math.sqrt(Math.log(totalVisits) / this.visits);
    }
}