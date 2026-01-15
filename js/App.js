import { BitState } from './BitState.js';
import { UI_CONSTANTS } from './constants.js';

export class App {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");
        
        // UI Elements
        this.statusEl = document.getElementById("status-msg");
        this.subMsgEl = document.getElementById("sub-msg");
        this.barSente = document.getElementById("bar-sente");
        this.barGote = document.getElementById("bar-gote");
        this.evalText = document.getElementById("eval-text");
        this.startScreen = document.getElementById("start-screen");
        this.timeSlider = document.getElementById("ai-time");
        this.timeVal = document.getElementById("ai-time-val");
        
        // Buttons
        document.getElementById("btn-start-sente").onclick = () => this.startGame(1);
        document.getElementById("btn-start-gote").onclick = () => this.startGame(-1);
        document.getElementById("btn-analyze").onclick = () => this.analyze();
        document.getElementById("btn-undo").onclick = () => this.undo();
        document.getElementById("btn-reset").onclick = () => this.showStartScreen();
        
        this.timeSlider.addEventListener("input", (e) => {
            this.timeVal.innerText = e.target.value;
        });

        this.worker = new Worker("js/ai.worker.js", { type: "module" });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        
        this.sessionId = 0;
        this.humanTurn = 1;
        this.gameState = new BitState();
        this.history = [];
        this.selected = null;
        this.isAiThinking = false;
        this.isAnalyzing = false;
        this.currentWorkerSession = 0;

        this.canvas.addEventListener("pointerdown", e => {
            e.preventDefault();
            this.handleInput(e);
        }, { passive: false });

        this.showStartScreen();
    }

    handleWorkerMessage(e) {
        const data = e.data;
        if (data.type === 'PROGRESS') {
            if (this.sessionId === this.currentWorkerSession) {
                this.subMsgEl.innerText = `読み筋: ${data.sims.toLocaleString()}手`;
            }
        } else if (data.type === 'FINISH') {
            if (this.sessionId === this.currentWorkerSession) {
                if (this.isAnalyzing) this.onAnalyzeFinish(data);
                else this.onAiFinish(data);
            }
        }
    }

    sendToWorker(type, durationSec) {
        this.currentWorkerSession = this.sessionId;
        // BitStateの状態を配列化して送る
        this.worker.postMessage({
            type: 'START',
            rootBoard: this.gameState.getBoardArray(),
            rootHands: this.getAllHandsArray(),
            rootTurn: this.gameState.turnSign,
            durationSec: durationSec,
            sessionId: this.sessionId
        });
    }
    
    getAllHandsArray() {
        const arr = new Int8Array(12).fill(0);
        for(let t=0; t<2; t++) {
            for(let k=1; k<=5; k++) {
                arr[(t*6) + k] = this.gameState.hands[t][k];
            }
        }
        return arr;
    }

    // ... (以下、startGame, handleInputなどは前回のApp.jsとほぼ同様だが、getLegalMoveの判定ロジックをBitState用(type:0/1)に変更) ...
    // 長くなるため省略せず、重要な変更点のみ記載します。他は前回のApp.jsを流用可能ですが、getLegalMoveだけ以下に置き換えてください。

    getLegalMove(sel, dstIdx) {
        const moves = this.gameState.getValidMoves();
        for (let m of moves) {
            if (sel.type === 'BOARD') {
                // type 0 = MOVE
                if (m.type === 0 && m.src === sel.idx && m.dst === dstIdx) return m;
            } else {
                // type 1 = DROP
                if (m.type === 1 && m.src === sel.kind && m.dst === dstIdx) return m;
            }
        }
        return null;
    }
    
    // (残りのメソッドは前回のApp.jsのままで動作しますが、this.gameState = new BitState() になっている点に注意してください)
    // 便宜上、完全なコードが必要なら前回出力のApp.jsに対し、constructor内の new BitState() と、上記の sendToWorker/getAllHandsArray/getLegalMove を差し替えればOKです。
    // ここでは冗長さを避けるため、上記変更点を示しました。
    // もしApp.js全体が必要であれば出力します。
}
// ここではApp.js全体が必要な場合は教えてください。そうでなければ上記の変更を適用してください。
// 安全のため、全体を出力します。

import { PIECE_NAMES, UI_CONSTANTS } from './constants.js';

export class App {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.statusEl = document.getElementById("status-msg");
        this.subMsgEl = document.getElementById("sub-msg");
        this.barSente = document.getElementById("bar-sente");
        this.barGote = document.getElementById("bar-gote");
        this.evalText = document.getElementById("eval-text");
        this.startScreen = document.getElementById("start-screen");
        this.timeSlider = document.getElementById("ai-time");
        this.timeVal = document.getElementById("ai-time-val");
        
        document.getElementById("btn-start-sente").onclick = () => this.startGame(1);
        document.getElementById("btn-start-gote").onclick = () => this.startGame(-1);
        document.getElementById("btn-analyze").onclick = () => this.analyze();
        document.getElementById("btn-undo").onclick = () => this.undo();
        document.getElementById("btn-reset").onclick = () => this.showStartScreen();
        
        this.timeSlider.addEventListener("input", (e) => { this.timeVal.innerText = e.target.value; });

        this.worker = new Worker("js/ai.worker.js", { type: "module" });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        
        this.sessionId = 0;
        this.humanTurn = 1;
        this.gameState = new BitState();
        this.history = [];
        this.selected = null;
        this.isAiThinking = false;
        this.isAnalyzing = false;
        this.currentWorkerSession = 0;

        this.canvas.addEventListener("pointerdown", e => { e.preventDefault(); this.handleInput(e); }, { passive: false });
        this.showStartScreen();
    }

    handleWorkerMessage(e) {
        const data = e.data;
        if (data.type === 'PROGRESS' && this.sessionId === this.currentWorkerSession) {
            this.subMsgEl.innerText = this.isAnalyzing ? `解析中: ${data.sims.toLocaleString()}手` : `読み筋: ${data.sims.toLocaleString()}手`;
        } else if (data.type === 'FINISH' && this.sessionId === this.currentWorkerSession) {
            this.isAnalyzing ? this.onAnalyzeFinish(data) : this.onAiFinish(data);
        }
    }

    sendToWorker(type, durationSec) {
        this.currentWorkerSession = this.sessionId;
        this.worker.postMessage({
            type: 'START',
            rootBoard: this.gameState.getBoardArray(),
            rootHands: this.getAllHandsArray(),
            rootTurn: this.gameState.turnSign,
            durationSec: durationSec,
            sessionId: this.sessionId
        });
    }

    getAllHandsArray() {
        const arr = new Int8Array(12).fill(0);
        for(let t=0; t<2; t++) {
            for(let k=1; k<=5; k++) {
                arr[(t*6) + k] = this.gameState.hands[t][k];
            }
        }
        return arr;
    }

    showStartScreen() {
        this.startScreen.style.display = "flex";
        this.worker.postMessage({ type: 'CANCEL' });
        this.isAiThinking = false;
        this.isAnalyzing = false;
        this.updateStatus();
    }

    startGame(hTurn) {
        this.startScreen.style.display = "none";
        this.sessionId++;
        this.humanTurn = hTurn;
        this.gameState = new BitState();
        this.history = [];
        this.selected = null;
        this.isAiThinking = false;
        this.isAnalyzing = false;
        this.updateEval(0.5, 1);
        this.updateStatus();
        this.subMsgEl.innerText = "";
        this.draw();
        if (this.gameState.turnSign !== this.humanTurn) this.startAi();
    }

    handleInput(e) {
        if (this.isAiThinking || this.isAnalyzing || this.gameState.turnSign !== this.humanTurn) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const ex = (e.clientX - rect.left) * scaleX;
        const ey = (e.clientY - rect.top) * scaleY;

        if (ey >= 580 && ey <= 650) {
            const hIdx = Math.floor((ex - 50) / 65);
            const handsList = this.gameState.getHandsList(this.humanTurn);
            if (hIdx >= 0 && hIdx < handsList.length) {
                this.selected = { type: 'HAND', idx: hIdx, kind: handsList[hIdx] };
                this.draw();
                return;
            }
        }
        const cDisp = Math.floor((ex - UI_CONSTANTS.BOARD_OFFSET_X) / UI_CONSTANTS.CELL_SIZE);
        const rDisp = Math.floor((ey - UI_CONSTANTS.BOARD_OFFSET_Y) / UI_CONSTANTS.CELL_SIZE);
        if (cDisp >= 0 && cDisp < 3 && rDisp >= 0 && rDisp < 4) {
            const logic = this.invTrans(rDisp, cDisp);
            const idx = logic.r * 3 + logic.c;
            const boardArr = this.gameState.getBoardArray();
            const p = boardArr[idx];
            if (p * this.humanTurn > 0) {
                this.selected = { type: 'BOARD', idx: idx, kind: Math.abs(p) };
                this.draw();
                return;
            }
            if (this.selected) {
                const move = this.getLegalMove(this.selected, idx);
                if (move) this.executeMove(move);
                else { this.selected = null; this.draw(); }
            }
        } else {
            this.selected = null;
            this.draw();
        }
    }

    getLegalMove(sel, dstIdx) {
        const moves = this.gameState.getValidMoves();
        for (let m of moves) {
            if (sel.type === 'BOARD') {
                if (m.type === 0 && m.src === sel.idx && m.dst === dstIdx) return m;
            } else {
                if (m.type === 1 && m.src === sel.kind && m.dst === dstIdx) return m;
            }
        }
        return null;
    }

    executeMove(move) {
        this.history.push(this.gameState.clone());
        this.gameState = this.gameState.makeMove(move);
        this.selected = null;
        this.draw();
        const res = this.gameState.isGameOver();
        if (res.over) { this.endGame(res.winner); return; }
        this.updateStatus();
        if (this.gameState.turnSign !== this.humanTurn) this.startAi();
    }

    startAi() {
        this.isAiThinking = true;
        this.updateStatus();
        const duration = parseFloat(this.timeSlider.value);
        this.sendToWorker('START', duration);
    }

    onAiFinish(res) {
        this.isAiThinking = false;
        this.updateEval(res.winRate, res.turn);
        if (res.sims === 9999) this.subMsgEl.innerText = `定石手`;
        else this.subMsgEl.innerText = `読み筋: ${res.sims.toLocaleString()}手`;
        
        if (!res.move) { alert("AIが投了しました"); this.updateStatus(); return; }
        this.history.push(this.gameState.clone());
        this.gameState = this.gameState.makeMove(res.move);
        this.draw();
        const resOver = this.gameState.isGameOver();
        if (resOver.over) { this.endGame(resOver.winner); }
        else { this.updateStatus(); }
    }

    analyze() {
        if (this.isAiThinking || this.isAnalyzing) return;
        this.isAnalyzing = true;
        this.updateStatus();
        this.sendToWorker('START', 3.0);
    }

    onAnalyzeFinish(res) {
        this.isAnalyzing = false;
        this.updateEval(res.winRate, res.turn);
        this.subMsgEl.innerText = `解析完了`;
        this.updateStatus();
    }

    undo() {
        if (this.isAiThinking || this.isAnalyzing || this.history.length === 0) return;
        this.worker.postMessage({ type: 'CANCEL' });
        if (this.history.length >= 2) {
            this.history.pop();
            this.gameState = this.history.pop();
        } else if (this.history.length === 1) {
            this.gameState = this.history.pop();
        }
        this.selected = null;
        this.draw();
        if (this.gameState.turnSign !== this.humanTurn) this.startAi();
        else { this.updateStatus(); this.subMsgEl.innerText = "待ったしました"; }
    }

    endGame(winner) {
        const msg = (winner === this.humanTurn) ? "あなたの勝ち！🎉" : "AIの勝ち...🤖";
        setTimeout(() => alert(msg), 100);
        this.statusEl.innerText = `終了: ${msg}`;
        this.isAiThinking = false;
        this.isAnalyzing = false;
        this.updateButtons();
    }

    updateStatus() {
        const t = this.humanTurn === 1 ? "先手(赤)" : "後手(青)";
        if (this.isAiThinking) {
            this.statusEl.innerText = "AI思考中...";
            this.statusEl.style.color = "#e57373";
        } else if (this.isAnalyzing) {
            this.statusEl.innerText = "形勢判断中...";
            this.statusEl.style.color = "#ab47bc";
        } else {
            this.statusEl.innerText = `あなたの番です ${t}`;
            this.statusEl.style.color = "#333";
        }
        this.updateButtons();
    }

    updateButtons() {
        const d = this.isAiThinking || this.isAnalyzing;
        document.getElementById("btn-undo").disabled = d || this.history.length === 0;
        document.getElementById("btn-reset").disabled = d;
        document.getElementById("btn-analyze").disabled = d || (this.gameState.turnSign !== this.humanTurn);
    }

    updateEval(rate, turnFrom) {
        let sRate = (turnFrom === 1) ? rate : (1.0 - rate);
        let sPer = Math.round(sRate * 100);
        this.barSente.style.width = `${sPer}%`;
        this.barGote.style.width = `${100 - sPer}%`;
        this.barSente.innerText = `先手 ${sPer}%`;
        this.barGote.innerText = `後手 ${100-sPer}%`;
        let txt = "互角";
        if (sPer >= 60) txt = "先手優勢";
        else if (sPer <= 40) txt = "後手優勢";
        else if (sPer >= 53) txt = "先手有利";
        else if (sPer <= 47) txt = "後手有利";
        this.evalText.innerText = `形勢: ${txt}`;
    }

    getViewFlip() { return this.humanTurn === -1; }
    trans(r, c) { return this.getViewFlip() ? { r: 3-r, c: 2-c } : { r: r, c: c }; }
    invTrans(r, c) { return this.getViewFlip() ? { r: 3-r, c: 2-c } : { r: r, c: c }; }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 3; c++) {
                const x = UI_CONSTANTS.BOARD_OFFSET_X + c * UI_CONSTANTS.CELL_SIZE;
                const y = UI_CONSTANTS.BOARD_OFFSET_Y + r * UI_CONSTANTS.CELL_SIZE;
                const isDark = (r + c) % 2 === 1;
                ctx.fillStyle = isDark ? UI_CONSTANTS.COLORS.BOARD_DARK : UI_CONSTANTS.COLORS.BOARD_LIGHT;
                ctx.fillRect(x, y, UI_CONSTANTS.CELL_SIZE, UI_CONSTANTS.CELL_SIZE);
                ctx.strokeStyle = "#8d6e63"; ctx.lineWidth = 1;
                ctx.strokeRect(x, y, UI_CONSTANTS.CELL_SIZE, UI_CONSTANTS.CELL_SIZE);
            }
        }
        
        const boardArr = this.gameState.getBoardArray();
        
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < 12; i++) {
            const p = boardArr[i];
            if (p === 0) continue;
            
            const r = Math.floor(i / 3);
            const c = i % 3;
            const tr = this.trans(r, c);
            const x = UI_CONSTANTS.BOARD_OFFSET_X + tr.c * UI_CONSTANTS.CELL_SIZE;
            const y = UI_CONSTANTS.BOARD_OFFSET_Y + tr.r * UI_CONSTANTS.CELL_SIZE;
            
            const kind = Math.abs(p);
            const isMy = (p * this.humanTurn > 0);
            const isSentePiece = (p > 0);
            
            let col = isMy ? UI_CONSTANTS.COLORS.SENTE_BASE : UI_CONSTANTS.COLORS.GOTE_BASE;
            let shd = isMy ? UI_CONSTANTS.COLORS.SENTE_SHADOW : UI_CONSTANTS.COLORS.GOTE_SHADOW;
            if (this.selected && this.selected.type === 'BOARD' && this.selected.idx === i) {
                col = UI_CONSTANTS.COLORS.SELECTED; shd = "#fbc02d";
            }
            
            let isReversed = !isSentePiece; 
            if (this.getViewFlip()) isReversed = !isReversed;

            this.drawKomaShape(x, y, UI_CONSTANTS.CELL_SIZE, isReversed, col, shd, kind, isMy, isSentePiece);
        }
        this.drawHand(this.gameState.getHandsList(-1 * this.humanTurn), 50, 40, false);
        this.drawHand(this.gameState.getHandsList(this.humanTurn), 50, 580, true);
    }

    drawKomaShape(x, y, size, isReversed, col, shd, kind, isMy, isSentePiece) {
        const ctx = this.ctx;
        const w = size; const h = size; const cx = x + w / 2; const cy = y + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        if (isReversed) ctx.rotate(Math.PI);
        ctx.translate(-cx, -cy);

        ctx.beginPath();
        ctx.moveTo(cx, y + 8); ctx.lineTo(x + w - 8, y + 28); ctx.lineTo(x + w - 12, y + h - 8);
        ctx.lineTo(x + 12, y + h - 8); ctx.lineTo(x + 8, y + 28); ctx.closePath();
        ctx.fillStyle = shd; ctx.save(); ctx.translate(0, 4); ctx.fill(); ctx.restore();
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, col); grad.addColorStop(1, col);
        ctx.fillStyle = grad; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
        
        if (isReversed) { ctx.rotate(Math.PI); }
        ctx.restore();

        ctx.save();
        ctx.font = "bold 34px 'Zen Maru Gothic', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = UI_CONSTANTS.COLORS.TEXT;
        ctx.fillText(PIECE_NAMES[kind], cx, cy + 8);
        ctx.restore();
    }

    drawHand(list, sx, sy, isMine) {
        this.ctx.textAlign = "left";
        this.ctx.fillStyle = UI_CONSTANTS.COLORS.TEXT;
        this.ctx.font = "bold 16px 'Zen Maru Gothic', sans-serif";
        this.ctx.fillText(isMine ? "自分(手前)" : "AI(奥)", sx, sy - 10);
        for (let i = 0; i < list.length; i++) {
            const k = list[i];
            const x = sx + i * 65;
            let col = isMine ? UI_CONSTANTS.COLORS.SENTE_BASE : UI_CONSTANTS.COLORS.GOTE_BASE;
            let shd = isMine ? UI_CONSTANTS.COLORS.SENTE_SHADOW : UI_CONSTANTS.COLORS.GOTE_SHADOW;
            if (isMine && this.selected && this.selected.type === 'HAND' && this.selected.idx === i) {
                col = UI_CONSTANTS.COLORS.SELECTED; shd = "#fbc02d";
            }
            this.drawKomaShape(x, sy, 50, false, col, shd, k, isMine, true);
        }
    }
}
