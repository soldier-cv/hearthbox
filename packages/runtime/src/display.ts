export type ScaleMode = 'integer' | 'fit';

export interface DisplayOptions {
  width: number;
  height: number;
  scale: ScaleMode;
  pixelArt: boolean;
}

export interface Display {
  readonly canvas: HTMLCanvasElement;
  /** 平台持有的唯一 2D 上下文，已按逻辑分辨率缩放。 */
  readonly ctx: CanvasRenderingContext2D;
  /** 监听尺寸变化并调整画布。返回取消函数。 */
  attach(container: HTMLElement): () => void;
  /** 逻辑分辨率（不是 backing store 尺寸）。 */
  readonly width: number;
  readonly height: number;
}

export interface DisplayConfig {
  /** 创建画布。默认用 document.createElement，测试可注入。 */
  createCanvas?: () => HTMLCanvasElement;
  /** 设备像素比，默认读 window.devicePixelRatio，缺失时 1。 */
  devicePixelRatio?: number;
}

export function createDisplay(options: DisplayOptions, config: DisplayConfig = {}): Display {
  const createCanvas =
    config.createCanvas ?? (() => document.createElement('canvas') as HTMLCanvasElement);
  const canvas = createCanvas();
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is not available');
  const ctx: CanvasRenderingContext2D = context;

  const dpr = config.devicePixelRatio ?? (globalThis.devicePixelRatio || 1);
  let container: HTMLElement | null = null;
  let detachResize: (() => void) | null = null;

  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.imageRendering = options.pixelArt ? 'pixelated' : 'auto';
  ctx.imageSmoothingEnabled = !options.pixelArt;

  function applyScale(): void {
    const boxWidth = container?.clientWidth ?? options.width;
    const boxHeight = container?.clientHeight ?? options.height;

    const raw = Math.min(boxWidth / options.width, boxHeight / options.height);
    const scale = options.scale === 'integer' ? Math.max(1, Math.floor(raw)) : Math.max(raw, 0.01);

    const cssWidth = Math.round(options.width * scale);
    const cssHeight = Math.round(options.height * scale);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // backing store 按 DPR 放大，逻辑坐标系保持不变。
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    // 每次改 canvas.width 都会重置上下文状态，所以这里重新设一次。
    ctx.setTransform(backingWidth / options.width, 0, 0, backingHeight / options.height, 0, 0);
    ctx.imageSmoothingEnabled = !options.pixelArt;
  }

  return {
    canvas,
    ctx,
    width: options.width,
    height: options.height,
    attach(target: HTMLElement) {
      container = target;
      if (canvas.parentNode !== target) target.appendChild(canvas);

      applyScale();

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => applyScale());
        observer.observe(target);
        detachResize = () => observer.disconnect();
      } else {
        const onResize = (): void => applyScale();
        window.addEventListener('resize', onResize);
        detachResize = () => window.removeEventListener('resize', onResize);
      }

      return () => {
        detachResize?.();
        detachResize = null;
        container = null;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    },
  };
}
