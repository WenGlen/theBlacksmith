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
/**
 * 插入深度 0 時，料的末端離火心多遠（公尺，負的代表還沒進火）。
 *
 * 行程不是寫死的：0 是末端剛好在火圈外，1 是**手邊那一端**推到火心。
 * 寫死 0.5 公尺的話，料拉長之後尾巴永遠進不了火
 * （Glen 2026-11-07 第三輪回報的就是這個）。實際行程在 forgePose 裡
 * 用當下的料長算。
 */
export const INSERT_BASE = -(FIRE_OUTER + 0.1);

/**
 * 爐前的鏡頭。
 *
 * 兩個條件一起決定的：
 *   1. 不能站在插入方向的同一條線上，否則料正對鏡頭縮成一個點，
 *      看不出推進去多深 —— 而深淺正是這個工位唯一要判斷的事
 *   2. 第一人稱是**自己左手拿著料**，所以料要從畫面左下角伸進火裡
 *      （Glen 2026-11-07 第三輪）
 *
 * 條件寫成向量：設 B 是「從火心指回手邊」的方向，鏡頭偏移是 (dx, dz)，
 * 則 B·(dx,dz) > 0（料朝鏡頭來，所以近端在畫面下方），
 * 且 B·right < 0（近端偏左），其中 right = (dz, 0, −dx) 正規化。
 * 第一次把 right 的符號寫反，結果料從右下伸進去，剛好相反。
 */
export const FORGE_EYE: [number, number, number] = [-0.37, 1.4, -1.05];
/** 爐前看哪裡 */
export const FORGE_LOOK: [number, number, number] = [-1.32, 0.8, -1.25];

/** 兩個工位之間走一趟要多久（秒）。期間不能操作，料繼續降溫 */
export const TRAVEL_SEC = 1.25;
