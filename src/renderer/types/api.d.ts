import type { OgmaApi } from '../../preload';

declare global {
  interface Window {
    api: OgmaApi;
  }
}

export {};
