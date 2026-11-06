/** 鍛造間的尺寸。全部是公尺，照真實鐵砧的高度與比例抓。 */

/** 砧面高度。真實鐵砧大概在鐵匠的手腕高 */
export const ANVIL_TOP = 0.78;
/** 砧面厚度 */
export const FACE_T = 0.045;
/** 砧面長度（沿 z） */
export const FACE_LEN = 0.46;
/** 砧面寬度（沿 x） */
export const FACE_W = 0.125;
/** 整個鍛打工位繞 Y 轉這麼多，讓鐵砧在畫面上是斜的 */
export const STATION_YAW = -0.38;
/** 工位在場景裡的位置 */
export const STATION_POS: [number, number, number] = [0.02, 0, -0.32];
/** 鏡頭：站在砧前低頭看 */
export const EYE: [number, number, number] = [0, 1.5, 0.5];
/** 鏡頭看哪裡 */
export const LOOK_AT: [number, number, number] = [0, 0.79, -0.3];
