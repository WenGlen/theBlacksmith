/**
 * 揮錘狀態機。
 *
 * 照 `06_輸入狀態機與動作文法.md` 第二節實作，從 2D 原型
 * `prototype/hammer-testbed.html` 原封不動搬過來的那一層。
 *
 * 這個檔案刻意不認識 three.js、不認識 React、也不認識世界座標。
 * 它只吃螢幕像素與時間，吐出「這一錘的力道、傾角、落點偏移」。
 * 3D 化真正要改的是呼叫端怎麼把落點換算成網格上的位置，不是這裡。
 *
 * 所有門檻都用「佔畫面寬度的比例」計算，不用像素，
 * 這樣不同解析度與 DPI 的手感才會一致（06 第 2.4 節）。
 */

/** 揮錘狀態機的四個狀態。 */
export type SwingState = 'idle' | 'armed' | 'windup' | 'swing';

/** 落點取樣方式，對應 06 第三節的分歧一。 */
export type LandingMode = 'anchor' | 'release' | 'hybrid';

/** 調校參數。全部是畫面寬度的比例或毫秒。 */
export const TUNING = {
  /** 死區：低於這個橫向位移當作手抖，不觸發後擺 */
  deadzoneR: 0.015,
  /** 連打要成立的最小單趟行程 */
  comboMinR: 0.06,
  /** 兩錘之間的最小間隔，低於這個不算新的一錘 */
  comboGapMs: 70,
  /** 後擺幅度封頂，超過不再加力但開始累積偏移 */
  windupCapR: 0.25,
  /** 速度上限：每秒掃過三個畫面寬度算滿力 */
  speedMaxR: 3.0,
  /** 力道取樣窗：放開前這段時間內的峰值速度 */
  peakWindowMs: 120,
  /** 收手判定：放開時游標離落點多近算把錘子放下 */
  recallR: 0.03,
  /** 傾角的滿刻度位移 */
  tiltSpanR: 0.12,
  /** 取樣環形緩衝保留多久 */
  sampleWindowMs: 200,
  /** hybrid 模式下，垂直抖動換算成偏移的係數 */
  jitterToOffsetR: 0.078,
  /** hybrid 模式下，超出封頂的過量幅度換算成偏移的係數 */
  overshootToOffsetR: 0.031,
} as const;

/** 一錘打出去的結果。座標都是畫面像素。 */
export interface SwingHit {
  /** 按下那一刻鎖定的落點 */
  anchor: { x: number; y: number };
  /** 放開（或連打反轉）那一刻的游標位置 */
  release: { x: number; y: number };
  /** 加上偏移之後真正打中的螢幕位置 */
  landing: { x: number; y: number };
  /** 偏移量（像素） */
  offsetPx: number;
  /** 力道 0..1 */
  force: number;
  /** 錘面傾角 -1..1，正值代表往螢幕右邊推 */
  tilt: number;
  /** 前擺期間的垂直抖動，已正規化成畫面高度的比例 */
  jitter: number;
  /** 這一錘是不是連打打出來的 */
  isCombo: boolean;
  /** 與前一錘的間隔毫秒，第一錘是 0 */
  intervalMs: number;
}

/** 狀態機要回報給外面的事件。 */
export interface SwingHandlers {
  /** 按下，鎖定落點 */
  onArm?: (p: { x: number; y: number }) => void;
  /** 狀態改變 */
  onState?: (s: SwingState, hint: string) => void;
  /** 真的打下去了 */
  onHit?: (hit: SwingHit) => void;
  /** 收手：舉起來又放下，不打 */
  onRecall?: () => void;
}

interface Sample {
  x: number;
  y: number;
  t: number;
  vx: number;
}

const HINTS: Record<SwingState, string> = {
  idle: '按住左鍵握錘，按下的那一點就是落點。',
  armed: '往一邊甩蓄力。甩得越遠，這一錘的力道上限越高。',
  windup: '反向甩回去出力，然後放開落錘。甩回原點附近再放開就是收手。',
  swing: '放開落錘。按住不放持續來回就是連打。',
};

/**
 * 揮錘狀態機。
 *
 * 用法：每個 pointer 事件餵進來，事件由 handlers 吐出去。
 * 呼叫端負責把 `SwingHit.landing` 這個螢幕座標換算成工件上的位置。
 */
export class SwingMachine {
  state: SwingState = 'idle';

  /** 視窗寬高，用來把所有門檻換算成像素 */
  private vw = 1920;
  private vh = 1080;

  private pressing = false;
  private anchor = { x: 0, y: 0 };
  private windupDir = 0;
  private windupPeak = 0;
  private windExtreme = 0;
  private swingDir = 0;
  private swingExtreme = 0;
  private swingStartX = 0;
  private swingStartY = 0;
  private peakSpeed = 0;
  private jitter = 0;
  private samples: Sample[] = [];
  private lastHitTime = 0;
  /** 這一次按住裡面已經連打了幾錘 */
  private comboInPress = 0;

  /** 落點取樣方式 */
  mode: LandingMode = 'hybrid';
  /** 技藝決定的基礎隨機偏移半徑，單位是畫面寬度的比例 */
  skillRadiusR = 0.012;
  /** 要不要啟用收手判定 */
  recallEnabled = true;
  /** 力道要不要取窗內峰值（關掉就取放開瞬間的速度，用來對照 06 的分歧二） */
  usePeakWindow = true;

  constructor(public handlers: SwingHandlers = {}) {}

  /** 更新視窗尺寸。所有門檻都是比例，換尺寸不會改手感。 */
  setViewport(w: number, h: number): void {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
  }

  /** 死區，像素 */
  private get deadzone(): number {
    return TUNING.deadzoneR * this.vw;
  }

  /** 後擺幅度 0..1，給錘子舉多高用 */
  get windupRatio(): number {
    return Math.min(1, this.windupPeak / this.vw / TUNING.windupCapR);
  }

  /** 後擺是不是已經超過封頂（畫面要變色提醒） */
  get isOvershooting(): boolean {
    return this.windupPeak / this.vw > TUNING.windupCapR;
  }

  /** 目前鎖定的落點，idle 時沒有意義 */
  get aim(): { x: number; y: number } {
    return this.anchor;
  }

  /**
   * 這一錘「打下去會偏多少」的預估半徑，單位是畫面寬度的比例。
   *
   * 這是 06 第四節那個抖動圈要的數字：把偏移變成看得見的東西，
   * 玩家才能自己決定要不要為了力道冒偏掉的風險。
   */
  get previewOffsetR(): number {
    if (this.mode !== 'hybrid') return this.skillRadiusR;
    const overshoot =
      Math.max(0, this.windupPeak - TUNING.windupCapR * this.vw) /
      (TUNING.windupCapR * this.vw);
    return (
      this.skillRadiusR +
      (this.jitter / this.vh) * TUNING.jitterToOffsetR +
      overshoot * TUNING.overshootToOffsetR
    );
  }

  private setState(s: SwingState): void {
    if (this.state === s) return;
    this.state = s;
    this.handlers.onState?.(s, HINTS[s]);
  }

  /**
   * 推一筆取樣進環形緩衝，回傳平滑過的橫向速度（像素／秒）。
   * 用最近三筆的平均，避免單幀抖動把峰值speed灌爆。
   */
  private pushSample(x: number, y: number, t: number): number {
    const prev = this.samples[this.samples.length - 1];
    let vx = 0;
    if (prev) {
      const dt = Math.max(1, t - prev.t);
      vx = ((x - prev.x) / dt) * 1000;
    }
    this.samples.push({ x, y, t, vx });
    while (this.samples.length && t - this.samples[0].t > TUNING.sampleWindowMs) {
      this.samples.shift();
    }
    const tail = this.samples.slice(-3);
    return tail.reduce((a, s) => a + s.vx, 0) / tail.length;
  }

  /** 放開前 peakWindowMs 之內的峰值速度 */
  private peakInWindow(now: number): number {
    let peak = 0;
    for (const s of this.samples) {
      if (now - s.t <= TUNING.peakWindowMs) peak = Math.max(peak, Math.abs(s.vx));
    }
    return peak;
  }

  /** 當下速度 */
  private get currentSpeed(): number {
    const last = this.samples[this.samples.length - 1];
    return last ? Math.abs(last.vx) : 0;
  }

  /** 左鍵按下：鎖定落點，進入握錘 */
  pointerDown(x: number, y: number, now: number): void {
    this.pressing = true;
    this.anchor = { x, y };
    this.windupDir = 0;
    this.windupPeak = 0;
    this.windExtreme = x;
    this.peakSpeed = 0;
    this.jitter = 0;
    this.comboInPress = 0;
    this.samples.length = 0;
    this.pushSample(x, y, now);
    this.setState('armed');
    this.handlers.onArm?.({ x, y });
  }

  /** 按住期間的移動：後擺蓄力、前擺出力、連打反轉 */
  pointerMove(x: number, y: number, now: number): void {
    if (!this.pressing) return;
    const vx = this.pushSample(x, y, now);
    const dz = this.deadzone;
    const dx = x - this.anchor.x;

    if (this.state === 'armed' && Math.abs(dx) > dz) {
      this.setState('windup');
      this.windupDir = dx > 0 ? 1 : -1;
      this.windExtreme = x;
    }

    if (this.state === 'windup') {
      if ((x - this.windExtreme) * this.windupDir > 0) this.windExtreme = x;
      this.windupPeak = Math.max(this.windupPeak, Math.abs(this.windExtreme - this.anchor.x));
      // 方向反轉：只看速度符號會在過零時誤判，所以同時要求反向累積位移超過死區
      if ((this.windExtreme - x) * this.windupDir > dz && Math.sign(vx) === -this.windupDir) {
        this.setState('swing');
        this.swingDir = -this.windupDir;
        this.swingExtreme = x;
        this.swingStartX = x;
        this.swingStartY = y;
        this.peakSpeed = 0;
        this.jitter = 0;
      }
      return;
    }

    if (this.state === 'swing') {
      this.peakSpeed = Math.max(this.peakSpeed, Math.abs(vx));
      this.jitter = Math.max(this.jitter, Math.abs(y - this.swingStartY));
      if ((x - this.swingExtreme) * this.swingDir > 0) this.swingExtreme = x;
      const travel = (this.swingExtreme - this.swingStartX) * this.swingDir;
      const reversed = (this.swingExtreme - x) * this.swingDir > dz;
      if (
        reversed &&
        travel > TUNING.comboMinR * this.vw &&
        now - this.lastHitTime > TUNING.comboGapMs &&
        Math.sign(vx) === -this.swingDir
      ) {
        this.registerHit(x, y, now, true);
        this.comboInPress += 1;
        this.swingDir = -this.swingDir;
        this.swingExtreme = x;
        this.swingStartX = x;
        this.swingStartY = y;
        this.peakSpeed = 0;
        this.jitter = 0;
      }
    }
  }

  /** 左鍵放開：結算，或判定為收手 */
  pointerUp(x: number, y: number, now: number): void {
    if (!this.pressing) return;
    this.pressing = false;
    if (this.state === 'swing') {
      const backHome = Math.abs(x - this.anchor.x) < TUNING.recallR * this.vw;
      const slow = this.currentSpeed < TUNING.deadzoneR * this.vw * 4;
      if (this.recallEnabled && backHome && slow) {
        this.handlers.onRecall?.();
      } else {
        this.registerHit(x, y, now, false);
      }
    }
    this.windupPeak = 0;
    this.peakSpeed = 0;
    this.setState('idle');
  }

  /** 指標離開畫面之類的中斷，當作沒打 */
  cancel(): void {
    if (!this.pressing) return;
    this.pressing = false;
    this.windupPeak = 0;
    this.peakSpeed = 0;
    this.setState('idle');
  }

  /** 結算一錘 */
  private registerHit(x: number, y: number, now: number, isCombo: boolean): void {
    const w = this.vw;
    const forceCap = Math.min(1, this.windupPeak / w / TUNING.windupCapR);
    const speed = this.usePeakWindow ? this.peakInWindow(now) : this.currentSpeed;
    const force = Math.max(
      0.04,
      Math.min(Math.min(1, speed / (w * TUNING.speedMaxR)), forceCap),
    );
    const tilt = Math.max(
      -1,
      Math.min(1, (x - this.anchor.x) / (w * TUNING.tiltSpanR)),
    );

    const base =
      this.mode === 'release' ? { x, y } : { x: this.anchor.x, y: this.anchor.y };

    let offR = this.skillRadiusR;
    if (this.mode === 'hybrid') {
      const overshoot =
        Math.max(0, this.windupPeak - TUNING.windupCapR * w) / (TUNING.windupCapR * w);
      offR +=
        (this.jitter / this.vh) * TUNING.jitterToOffsetR +
        overshoot * TUNING.overshootToOffsetR;
    }
    const offMag = offR * w;
    const ang = Math.random() * Math.PI * 2;
    const rad = offMag * Math.sqrt(Math.random());
    const landing = { x: base.x + Math.cos(ang) * rad, y: base.y + Math.sin(ang) * rad };

    const intervalMs = this.lastHitTime ? now - this.lastHitTime : 0;
    this.lastHitTime = now;

    this.handlers.onHit?.({
      anchor: { ...this.anchor },
      release: { x, y },
      landing,
      offsetPx: rad,
      force,
      tilt,
      jitter: this.jitter / this.vh,
      isCombo,
      intervalMs,
    });
  }
}
