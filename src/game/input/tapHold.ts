/**
 * 點按與長按分流。
 *
 * 這是 `07_3D 化設計與技術選型.md` 第 2.1 節那條設計的實作：
 * 同一個鍵，點一下是離散跳一格（原設計的行為），
 * 按住不放變成連續（3D 之後新增的自由度）。不加鍵、不加模式。
 */

export interface TapHoldOptions {
  /** 按多久算長按 */
  holdMs?: number;
  /** 點一下 */
  onTap: (dir: number) => void;
  /** 按住期間每幀呼叫 */
  onHold: (dir: number, dtMs: number) => void;
}

/**
 * 一組方向相反的兩個鍵（例如 Q 與 E）構成一個軸。
 */
export class TapHoldAxis {
  private pressedAt = new Map<number, number>();
  private readonly holdMs: number;

  constructor(private o: TapHoldOptions) {
    this.holdMs = o.holdMs ?? 180;
  }

  /** 有沒有任何方向正在長按 */
  get holding(): boolean {
    for (const t of this.pressedAt.values()) {
      if (performance.now() - t >= this.holdMs) return true;
    }
    return false;
  }

  /** 鍵按下。重複觸發的 keydown 會被忽略。 */
  press(dir: number, now: number): void {
    if (this.pressedAt.has(dir)) return;
    this.pressedAt.set(dir, now);
  }

  /** 鍵放開。沒超過門檻就當作點一下。 */
  release(dir: number, now: number): void {
    const t = this.pressedAt.get(dir);
    if (t === undefined) return;
    this.pressedAt.delete(dir);
    if (now - t < this.holdMs) this.o.onTap(dir);
  }

  /** 每幀呼叫，把超過門檻的鍵推成連續動作。 */
  update(now: number, dtMs: number): void {
    for (const [dir, t] of this.pressedAt) {
      if (now - t >= this.holdMs) this.o.onHold(dir, dtMs);
    }
  }

  /** 失焦時清掉，避免鍵卡住 */
  clear(): void {
    this.pressedAt.clear();
  }
}
