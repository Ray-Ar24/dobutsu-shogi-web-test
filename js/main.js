import { App } from './App.js';

// ページ読み込み完了時にアプリケーションを起動
window.addEventListener("load", () => {
    // グローバル変数に格納（デバッグ等でアクセスしやすくするため）
    window.game = new App();
});