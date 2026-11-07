/** 鍛造間的尺寸。全部是公尺，照真實鐵砧的高度與比例抓。 */

/** 砧面高度。真實鐵砧大概在鐵匠的手腕高 */
export const ANVIL_TOP = 0.78;
/** 砧面厚度 */
export const FACE_T = 0.045;
/** 砧面長度（沿 z） */
export const FACE_LEN = 0.46;
/** 砧面寬度（沿 x） */
export const FACE_W = 0.125;
/**
 * 整個鍛打工位繞 Y 轉這麼多，讓鐵砧在畫面上是斜的。
 *
 * 2026-11-07 從 -0.38 加到 -0.62：棒子在畫面上要夠斜，
 * A/D 推進的方向才看得出來是沿著棒子走，不是在螢幕上平移。
 */
export const STATION_YAW = -0.62;
/** 工位在場景裡的位置 */
export const STATION_POS: [number, number, number] = [0.02, 0, -0.32];
/**
 * 鏡頭：站在砧前低頭看。
 *
 * 2026-11-07 第二輪從 [0, 1.5, 0.5] 拉近到這裡。眼睛到砧面的距離
 * 從 1.07 m 縮到 0.84 m，工件變大、俯角變陡，才有站在砧前的壓迫感。
 * 這同時解掉錘子的問題：手離落點近了，握柄長度才會落在合理範圍。
 */
export const EYE: [number, number, number] = [0, 1.44, 0.22];
/** 鏡頭看哪裡 */
export const LOOK_AT: [number, number, number] = [0, 0.8, -0.3];

/* ───────── 爐火工位（第 1 刀） ───────── */

/** 爐子在場景裡的位置與朝向，要跟 Forge.tsx 的 group 一致 */
export const FORGE_POS: [number, number, number] = [-1.32, 0, -1.25];
/** 炭床頂面的高度 */
export const COAL_TOP = 0.802;
/** 火心（世界座標） */
export const FIRE_CENTER: [number, number, number] = [-1.32, COAL_TOP, -1.25];
/**
 * 工件插進火裡的方向（世界座標，單位向量，水平）。
 * 從鍛打工位指向爐子，所以玩家是從自己這邊把料推進去。
 */
export const FIRE_AXIS: [number, number, number] = [-0.822, 0, -0.57];
/** 離火心超過這麼遠就完全吃不到熱（公尺） */
export const FIRE_OUTER = 0.34;
/** 插入深度 0 到 1 之間，料的末端沿 FIRE_AXIS 走這麼長（公尺） */
export const INSERT_SPAN = 0.5;
/** 插入深度 0 時，料的末端離火心多遠（公尺，負的代表還沒到） */
export const INSERT_BASE = -0.34;

/**
 * 爐前的鏡頭。
 *
 * 刻意站在**插入方向的側面**。站在同一條線上的話，料是正對著鏡頭的，
 * 整根縮成一個點，玩家完全看不出來推進去多深 —— 而深淺正是這個工位
 * 唯一要判斷的事。
 */
export const FORGE_EYE: [number, number, number] = [-2.02, 1.44, -0.26];
/** 爐前看哪裡 */
export const FORGE_LOOK: [number, number, number] = [-1.3, 0.8, -1.18];

/** 兩個工位之間走一趟要多久（秒）。期間不能操作，料繼續降溫 */
export const TRAVEL_SEC = 1.25;
