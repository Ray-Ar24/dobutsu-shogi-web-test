import tkinter as tk
from tkinter import messagebox
import threading
import sys
import os
import subprocess
import importlib
import glob

# --- 自動セットアップ & ビルドロジック ---
def load_cpp_core():
    # 1. ソースの更新確認
    needs_build = False
    cpp_file = "doubutsu_core.cpp"
    
    # OSごとの拡張子
    ext = ".pyd" if sys.platform == "win32" else ".so"
    target_files = glob.glob(f"doubutsu_core*{ext}")
    
    if not os.path.exists(cpp_file):
        messagebox.showerror("Error", f"{cpp_file} が見つかりません。")
        sys.exit(1)

    if not target_files:
        needs_build = True
    else:
        # タイムスタンプ比較: cppが新しければ再ビルド
        cpp_mtime = os.path.getmtime(cpp_file)
        # 最も新しいライブラリと比較
        target_file = max(target_files, key=os.path.getmtime)
        lib_mtime = os.path.getmtime(target_file)
        
        if cpp_mtime > lib_mtime:
            print("[System] ソースコードの更新を検出しました。再ビルドします...")
            needs_build = True
            # 古いファイルを削除試行 (Windowsではロックされていると失敗するが、リネームされるので続行可能)
            try:
                os.remove(target_file)
            except OSError:
                pass

    if needs_build:
        print("[System] C++エンジンのビルドを開始します...")
        try:
            import pybind11
        except ImportError:
            print("[System] pybind11 をインストール中...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pybind11"])
        
        try:
            subprocess.check_call([sys.executable, "setup.py", "build_ext", "--inplace"])
            print("[System] ビルド完了！")
        except subprocess.CalledProcessError:
            messagebox.showerror("Build Error", "ビルドに失敗しました。C++コンパイラ(Visual Studio Build Tools)を確認してください。")
            sys.exit(1)
        
        # キャッシュをクリアしてリロード
        importlib.invalidate_caches()

    try:
        return importlib.import_module("doubutsu_core")
    except ImportError as e:
        messagebox.showerror("Import Error", f"モジュールの読み込みに失敗しました。\n{e}")
        sys.exit(1)

doubutsu_core = load_cpp_core()


# --- GUI App ---
CELL_SIZE = 100
BOARD_OFFSET_X = 75
BOARD_OFFSET_Y = 150
PIECE_NAMES = {1: "ひ", 2: "き", 3: "ぞ", 4: "王", 5: "に"}
COLORS = {
    "SENTE_BASE": "#ff7043", "SENTE_SHADOW": "#bf360c",
    "GOTE_BASE": "#42a5f5", "GOTE_SHADOW": "#0d47a1",
    "BOARD_LIGHT": "#fff9c4", "BOARD_DARK": "#fff176",
    "SELECTED": "#ffee58", "TEXT": "#3e2723"
}

class App:
    def __init__(self, root):
        self.root = root
        self.root.title("動物将棋 AI (Desktop)")
        self.root.geometry("450x800")
        self.root.configure(bg="#faf7f0")
        self.root.resizable(False, False)

        self.ai = doubutsu_core.AI()
        self.human_turn = 1
        self.game_state = doubutsu_core.GameState()
        self.history = []
        self.selected = None
        self.is_ai_thinking = False
        
        self.setup_ui()
        self.show_start_screen()

    def setup_ui(self):
        tk.Label(self.root, text="🦁 動物将棋 AI", font=("Meiryo", 20, "bold"), bg="#faf7f0", fg="#5d4037").pack(pady=5)

        self.eval_frame = tk.Frame(self.root, height=24, bg="#eee")
        self.eval_frame.pack(fill=tk.X, padx=12)
        self.bar_sente = tk.Label(self.eval_frame, text="先手 50%", bg=COLORS["SENTE_BASE"], fg="white", font=("Arial", 9, "bold"), anchor="w")
        self.bar_sente.place(relx=0, rely=0, relwidth=0.5, relheight=1)
        self.bar_gote = tk.Label(self.eval_frame, text="後手 50%", bg=COLORS["GOTE_BASE"], fg="white", font=("Arial", 9, "bold"), anchor="e")
        self.bar_gote.place(relx=0.5, rely=0, relwidth=0.5, relheight=1)
        
        self.eval_text = tk.Label(self.root, text="形勢: 互角", bg="#faf7f0", fg="#5d4037", font=("Meiryo", 10, "bold"))
        self.eval_text.pack()

        self.status_box = tk.Frame(self.root, bg="#f5f5f5", bd=1, relief="solid", padx=5, pady=5)
        self.status_box.pack(pady=5, fill=tk.X, padx=12)
        self.status_msg = tk.Label(self.status_box, text="準備中...", font=("Meiryo", 12, "bold"), bg="#f5f5f5")
        self.status_msg.pack()
        self.sub_msg = tk.Label(self.status_box, text="", font=("Meiryo", 9), bg="#f5f5f5", fg="#757575")
        self.sub_msg.pack()

        self.canvas = tk.Canvas(self.root, width=450, height=700, bg="#ffe082", highlightthickness=0)
        self.canvas.pack(pady=5)
        self.canvas.bind("<Button-1>", self.handle_click)

        ctrl_frame = tk.Frame(self.root, bg="#faf7f0")
        ctrl_frame.pack(fill=tk.X, padx=12, pady=5)
        self.btn_analyze = tk.Button(ctrl_frame, text="🤔 形勢判断", bg="#8e24aa", fg="white", font=("Meiryo", 10, "bold"), command=self.analyze)
        self.btn_analyze.pack(fill=tk.X, pady=2)
        
        row_frame = tk.Frame(ctrl_frame, bg="#faf7f0")
        row_frame.pack(fill=tk.X)
        self.btn_undo = tk.Button(row_frame, text="↩ 待った", bg="#00897b", fg="white", font=("Meiryo", 10, "bold"), command=self.undo)
        self.btn_undo.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
        self.btn_reset = tk.Button(row_frame, text="🔄 最初から", bg="#e53935", fg="white", font=("Meiryo", 10, "bold"), command=self.show_start_screen)
        self.btn_reset.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)

        setting_frame = tk.Frame(self.root, bg="#fff3e0", bd=1, relief="solid")
        setting_frame.pack(fill=tk.X, padx=12, pady=5)
        tk.Label(setting_frame, text="AI思考時間:", bg="#fff3e0", fg="#5d4037", font=("Meiryo", 9, "bold")).pack(side=tk.LEFT, padx=5)
        self.time_scale = tk.Scale(setting_frame, from_=1, to=20, orient=tk.HORIZONTAL, bg="#fff3e0", length=200, showvalue=True)
        self.time_scale.set(5)
        self.time_scale.pack(side=tk.LEFT)
        tk.Label(setting_frame, text="秒", bg="#fff3e0", fg="#5d4037", font=("Meiryo", 9, "bold")).pack(side=tk.LEFT)

        self.start_frame = tk.Frame(self.root, bg="#ffffff")
        self.start_frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        inner = tk.Frame(self.start_frame, bg="white", padx=20, pady=20)
        inner.place(relx=0.5, rely=0.5, anchor="center")
        tk.Label(inner, text="対局開始", font=("Meiryo", 18, "bold"), bg="white").pack(pady=10)
        tk.Button(inner, text="先手で対局 (手前)", bg=COLORS["SENTE_BASE"], fg="white", font=("Meiryo", 14), command=lambda: self.start_game(1), width=15).pack(pady=5)
        tk.Button(inner, text="後手で対局 (AI先手)", bg=COLORS["GOTE_BASE"], fg="white", font=("Meiryo", 14), command=lambda: self.start_game(-1), width=15).pack(pady=5)

    def show_start_screen(self):
        self.start_frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        self.update_buttons()

    def start_game(self, h_turn):
        self.start_frame.place_forget()
        self.human_turn = h_turn
        self.game_state = doubutsu_core.GameState()
        self.history = []
        self.selected = None
        self.is_ai_thinking = False
        self.update_eval(0.5, 1)
        self.update_status()
        self.sub_msg.config(text="")
        self.draw()
        if self.game_state.turn != self.human_turn:
            self.start_ai()

    def handle_click(self, event):
        if self.is_ai_thinking or self.game_state.turn != self.human_turn: return
        x, y = event.x, event.y
        # Hand
        if 580 <= y <= 650:
            h_idx = (x - 50) // 65
            hands = self.game_state.getHandsList(self.human_turn)
            if 0 <= h_idx < len(hands):
                self.selected = {"type": "HAND", "idx": h_idx, "kind": hands[h_idx]}
                self.draw()
                return
        # Board
        c_disp = (x - BOARD_OFFSET_X) // CELL_SIZE
        r_disp = (y - BOARD_OFFSET_Y) // CELL_SIZE
        if 0 <= c_disp < 3 and 0 <= r_disp < 4:
            r, c = r_disp, c_disp
            if self.human_turn == -1: r, c = 3 - r, 2 - c
            idx = r * 3 + c
            p = self.game_state.board[idx]
            if p * self.human_turn > 0:
                self.selected = {"type": "BOARD", "idx": idx, "kind": abs(p)}
                self.draw()
                return
            if self.selected:
                move = self.get_legal_move(self.selected, idx)
                if move: self.execute_move(move)
                else:
                    self.selected = None
                    self.draw()
        else:
            self.selected = None
            self.draw()

    def get_legal_move(self, sel, dst_idx):
        moves = self.game_state.getValidMoves()
        for m in moves:
            if sel["type"] == "BOARD":
                if m.type == "MOVE" and m.src == sel["idx"] and m.dst == dst_idx: return m
            else:
                if m.type == "DROP" and m.src == sel["kind"] and m.dst == dst_idx: return m
        return None

    def execute_move(self, move):
        # 修正: C++側でcloneを実装したので、呼び出し可能になりました
        self.history.append(self.game_state.clone())
        self.game_state = self.game_state.makeMove(move)
        self.selected = None
        self.draw()
        res = self.game_state.getGameResult()
        if res[0]: self.end_game(res[1])
        else:
            self.update_status()
            if self.game_state.turn != self.human_turn: self.start_ai()

    def start_ai(self):
        self.is_ai_thinking = True
        self.update_status()
        duration = self.time_scale.get()
        
        # 思考用スレッド
        def run():
            # 進捗コールバック（スレッドからメインスレッドのGUIを更新）
            def progress_cb(s):
                self.root.after(0, lambda: self.sub_msg.config(text=f"読み筋: {s:,}手"))
            
            res = self.ai.search(self.game_state, float(duration), progress_cb)
            self.root.after(0, lambda: self.on_ai_finish(res))
        
        threading.Thread(target=run, daemon=True).start()

    def on_ai_finish(self, res):
        self.is_ai_thinking = False
        self.update_eval(res.winRate, self.game_state.turn)
        if res.sims == 9999: self.sub_msg.config(text="定石手")
        else: self.sub_msg.config(text=f"読み筋: {res.sims:,}手")
        
        if not res.hasMove:
            messagebox.showinfo("終了", "AIが投了しました")
            return
        
        self.history.append(self.game_state.clone())
        self.game_state = self.game_state.makeMove(res.bestMove)
        self.draw()
        game_res = self.game_state.getGameResult()
        if game_res[0]: self.end_game(game_res[1])
        else: self.update_status()

    def analyze(self):
        if self.is_ai_thinking: return
        self.is_ai_thinking = True
        self.status_msg.config(text="形勢判断中...", fg="#ab47bc")
        self.update_buttons()
        def run():
            def progress_cb(s):
                self.root.after(0, lambda: self.sub_msg.config(text=f"解析中: {s:,}手"))
            res = self.ai.search(self.game_state, 3.0, progress_cb)
            self.root.after(0, lambda: self.on_analyze_finish(res))
        threading.Thread(target=run, daemon=True).start()

    def on_analyze_finish(self, res):
        self.is_ai_thinking = False
        self.update_eval(res.winRate, self.game_state.turn)
        self.sub_msg.config(text="解析完了")
        self.update_status()

    def undo(self):
        if self.is_ai_thinking or not self.history: return
        if len(self.history) >= 2:
            self.history.pop()
            self.game_state = self.history.pop()
        elif len(self.history) == 1:
            self.game_state = self.history.pop()
        self.selected = None
        self.draw()
        if self.game_state.turn != self.human_turn: self.start_ai()
        else:
            self.update_status()
            self.sub_msg.config(text="待ったしました")

    def end_game(self, winner):
        msg = "あなたの勝ち！🎉" if winner == self.human_turn else "AIの勝ち...🤖"
        messagebox.showinfo("終了", msg)
        self.status_msg.config(text=f"終了: {msg}", fg="#333")
        self.is_ai_thinking = False
        self.update_buttons()

    def update_status(self):
        t_str = "先手(赤)" if self.human_turn == 1 else "後手(青)"
        if self.is_ai_thinking: self.status_msg.config(text="AI思考中...", fg="#e57373")
        else: self.status_msg.config(text=f"あなたの番です {t_str}", fg="#333")
        self.update_buttons()

    def update_buttons(self):
        d = self.is_ai_thinking
        state = tk.DISABLED if d else tk.NORMAL
        self.btn_undo.config(state=tk.DISABLED if d or not self.history else tk.NORMAL)
        self.btn_reset.config(state=state)
        self.btn_analyze.config(state=tk.DISABLED if d or self.game_state.turn != self.human_turn else tk.NORMAL)

    def update_eval(self, rate, turn_from):
        s_rate = rate if turn_from == 1 else (1.0 - rate)
        s_per = int(s_rate * 100)
        self.bar_sente.place(relwidth=s_per/100)
        self.bar_gote.place(relx=s_per/100, relwidth=(100-s_per)/100)
        self.bar_sente.config(text=f"先手 {s_per}%")
        self.bar_gote.config(text=f"後手 {100-s_per}%")
        txt = "互角"
        if s_per >= 60: txt = "先手優勢"
        elif s_per <= 40: txt = "後手優勢"
        elif s_per >= 53: txt = "先手有利"
        elif s_per <= 47: txt = "後手有利"
        self.eval_text.config(text=f"形勢: {txt}")

    def draw(self):
        self.canvas.delete("all")
        for r in range(4):
            for c in range(3):
                x = BOARD_OFFSET_X + c * CELL_SIZE
                y = BOARD_OFFSET_Y + r * CELL_SIZE
                col = COLORS["BOARD_DARK"] if (r+c)%2 else COLORS["BOARD_LIGHT"]
                self.canvas.create_rectangle(x, y, x+CELL_SIZE, y+CELL_SIZE, fill=col, outline="#8d6e63")
        view_flip = (self.human_turn == -1)
        for i in range(12):
            p = self.game_state.board[i]
            if p == 0: continue
            r, c = i // 3, i % 3
            if view_flip: r, c = 3 - r, 2 - c
            x = BOARD_OFFSET_X + c * CELL_SIZE
            y = BOARD_OFFSET_Y + r * CELL_SIZE
            kind = abs(p)
            is_my = (p * self.human_turn > 0)
            is_sente_piece = (p > 0)
            bg_col = COLORS["SENTE_BASE"] if is_my else COLORS["GOTE_BASE"]
            if self.selected and self.selected["type"] == "BOARD" and self.selected["idx"] == i:
                bg_col = COLORS["SELECTED"]
            is_reversed = not is_sente_piece
            if view_flip: is_reversed = not is_reversed
            self.draw_koma(x, y, CELL_SIZE, is_reversed, bg_col, kind, is_my)
        self.draw_hand(self.game_state.getHandsList(-1 * self.human_turn), 50, 40, False)
        self.draw_hand(self.game_state.getHandsList(self.human_turn), 50, 580, True)

    def draw_koma(self, x, y, size, is_reversed, color, kind, is_my):
        cx, cy = x + size/2, y + size/2
        pts = [cx, y+10, x+size-10, y+30, x+size-15, y+size-10, x+15, y+size-10, x+10, y+30]
        if is_reversed:
            pts = [cx, y+size-10, x+size-10, y+size-30, x+size-15, y+10, x+15, y+10, x+10, y+size-30]
        self.canvas.create_polygon(pts, fill=color, outline="#8d6e63", width=1)
        txt = PIECE_NAMES[kind]
        fg = COLORS["TEXT"]
        self.canvas.create_text(cx, cy, text=txt, font=("Meiryo", 24, "bold"), fill=fg)

    def draw_hand(self, hand_list, sx, sy, is_mine):
        label = "自分(手前)" if is_mine else "AI(奥)"
        self.canvas.create_text(sx, sy-15, text=label, anchor="w", font=("Meiryo", 10, "bold"), fill=COLORS["TEXT"])
        for i, k in enumerate(hand_list):
            x = sx + i * 65
            col = COLORS["SENTE_BASE"] if is_mine else COLORS["GOTE_BASE"]
            if is_mine and self.selected and self.selected["type"] == "HAND" and self.selected["idx"] == i:
                col = COLORS["SELECTED"]
            self.draw_koma(x, sy, 50, False, col, k, is_mine)

if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()
