import type { AssetLoader } from '@hearthbox/sdk';

export function createAssetLoader(
  resolve: (path: string) => string,
  audio: { ctx: BaseAudioContext },
): AssetLoader {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const audios = new Map<string, Promise<AudioBuffer>>();

  return {
    image(path: string) {
      let promise = images.get(path);
      if (!promise) {
        promise = new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error(`image load failed: ${path}`));
          img.src = resolve(path);
        });
        images.set(path, promise);
      }
      return promise;
    },
    audio(path: string) {
      let promise = audios.get(path);
      if (!promise) {
        promise = (async () => {
          const response = await fetch(resolve(path));
          if (!response.ok) throw new Error(`audio fetch failed: ${path}`);
          // 用平台的 AudioContext 解码：Chromium 对同时存在的上下文数量有上限。
          return audio.ctx.decodeAudioData(await response.arrayBuffer());
        })();
        audios.set(path, promise);
      }
      return promise;
    },
    async json<T>(path: string): Promise<T> {
      const response = await fetch(resolve(path));
      if (!response.ok) throw new Error(`json fetch failed: ${path}`);
      return (await response.json()) as T;
    },
    async text(path: string): Promise<string> {
      const response = await fetch(resolve(path));
      if (!response.ok) throw new Error(`text fetch failed: ${path}`);
      return response.text();
    },
    url(path: string): string {
      return resolve(path);
    },
  };
}
