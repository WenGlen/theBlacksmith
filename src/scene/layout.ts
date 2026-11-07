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
