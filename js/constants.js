export const HIYOKO = 1;
export const KIRIN = 2;
export const ZOU = 3;
export const LION = 4;
export const NIWATORI = 5;

export const PIECE_NAMES = { 1: "ひ", 2: "き", 3: "ぞ", 4: "王", 5: "に" };
export const PIECE_VALUES = { 1: 10, 2: 40, 3: 40, 4: 1000, 5: 50 };

// 駒の移動定義
export const DIRS = {
    1: [[-1, 0]], 
    2: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    3: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    4: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
    5: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]]
};

export const UI_CONSTANTS = {
    CELL_SIZE: 100,
    BOARD_OFFSET_X: 75,
    BOARD_OFFSET_Y: 150,
    COLORS: {
        SENTE_BASE: "#ff7043", SENTE_SHADOW: "#bf360c",
        GOTE_BASE: "#42a5f5", GOTE_SHADOW: "#0d47a1",
        BOARD_LIGHT: "#fff9c4", BOARD_DARK: "#fff176",
        SELECTED: "#ffee58", TEXT: "#3e2723"
    }
};