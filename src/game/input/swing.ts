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
  deadzoneR: 0.018,
  /** 連打要成立的最小單趟行程 */
  comboMinR: 0.08,
  /** 兩錘之間的最小間隔，低於這個不算新的一錘 */
  comboGapMs: 70,
  /**
   * 後擺幅度封頂，超過不再加力但開始累積偏移。
   *
   * 2026-11-07 第三輪從 0.3 拉到 0.46。前一輪為了「好控制」把這些門檻
   * 全部調小，結果是**靈敏度變高**：滑鼠走一點點就滿格，反而更難控制。
   * 要好控制靠的是行程長，不是門檻低。
   */
  windupCapR: 0.46,
  /** 速度上限：每秒掃過這麼多個畫面寬度算滿力 */
  speedMaxR: 3.4,
  /** 力道取樣窗：放開前這段時間內的峰值速度 */
  peakWindowMs: 140,
  /**
   * 已停用。
   *
   * 收手曾經是「放開時游標離按下點多近」，2026-11-08 改成「還沒甩回來就
   * 放開」之後這個門檻沒有人讀了。留著是因為 06 文件第三節的分歧二還在
   * 比較兩種做法，把數字一起刪掉會看不懂當初比的是什麼。
   */
  recallR: 0.045,
  /** 傾角的滿刻度位移 */
  tiltSpanR: 0.26,
  /** 取樣環形緩衝保留多久 */
  sampleWindowMs: 200,
  /** hybrid 模式下，垂直抖動換算成偏移的係數 */
  jitterToOffsetR: 0.055,
  /** hybrid 模式下，超出封頂的過量幅度換算成偏移的係數 */
  overshootToOffsetR: 0.022,
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
  idle: '按住左鍵把錘子舉起來。',
  armed: '往左或往右甩蓄力。甩得越遠，錘子舉得越高，力道上限也越高。放開就是收手。',
  windup: '反向甩回去出力，游標移到想打的那一段再放開。現在放開不算一錘。',
  swing: '放開落錘，打在游標現在指的位置。按住不放持續來回就是連打。',
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

  /**
   * 落點取樣方式。
   *
   * 預設是 release：按下只是「把錘子舉起來」，放開的那一點才是落點。
   * 這讓按下到放開之間整段手勢都還能改主意，錘子是垂下去打的，
   * 不是一按下就釘死在那一點。
   */
  mode: LandingMode = 'release';
  /** 技藝決定的基礎隨機偏移半徑，單位是畫面寬度的比例 */
  skillRadiusR = 0.012;
  /**
   * 落點往按下點收斂的比例 0..1，由 `game/skill/skill.ts` 的等級推出來。
   *
   * 落點原本是放開時的游標位置 1:1 換算到棒子上。棒子在畫面上只佔螢幕寬
   * 三成，蓄力卻要甩出 46%，所以甩回來時幾個像素的誤差就是好幾段的落差
   * （Glen 2026-11-08：判定範圍還是太小）。往按下點收斂等於把整段甩回的
   * 行程壓縮到意圖點附近，誤差跟著一起被壓縮。
   */
  assist = 0;
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

  /**
   * 把游標位置換算成「現在放開會打到哪」。
   *
   * 呼叫端的落點預覽一定要走這裡，不然預覽畫的是游標、結算用的是收斂後的
   * 位置，兩者對不起來，玩家永遠學不會這個手勢。
   */
  assistedPoint(x: number, y: number): { x: number; y: number } {
    if (this.state === 'idle') return { x, y };
    if (this.mode !== 'release') return { x: this.anchor.x, y: this.anchor.y };
    const k = 1 - Math.max(0, Math.min(1, this.assist));
    return {
      x: this.anchor.x + (x - this.anchor.x) * k,
      y: this.anchor.y + (y - this.anchor.y) * k,
    };
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
      // 甩回來了就一定打下去。
      //
      // 以前這裡還有一條「放開時回到按下點附近且慢下來＝收手」。
      // 落點改由放開位置決定、按下點又等於想打的點之後，那條規則把
      // 「仔細瞄準到位」和「取消這一錘」判成同一個動作 —— 瞄得越準越
      // 打不出去（Glen 2026-11-08：拿不定主意判定是按下還是放開）。
      this.registerHit(x, y, now, false);
    } else if (this.state === 'armed' || this.state === 'windup') {
      // 舉起來又放下：還沒反向甩回來就放開，這一錘不算。
      if (this.recallEnabled) this.handlers.onRecall?.();
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
    // 傾角：錘子從哪一側掃過來，金屬就往那一側跑。
    //
    // 以前量的是「放開點離按下點多遠」。落點改由放開位置決定之後，
    // 那個量就等於落點本身，傾角會跟著落點一起動，失去獨立意義。
    // 改成量這一趟掃的行程：起點是這一趟開始的地方，不是按下的地方，
    // 所以連打時每一趟各自算各自的。
    const tilt = Math.max(
      -1,
      Math.min(1, (x - this.swingStartX) / (w * TUNING.tiltSpanR)),
    );

    const base = this.assistedPoint(x, y);

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
