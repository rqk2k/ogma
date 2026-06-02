import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IpcChannels } from '../shared/ipcChannels';
import type {
  Formality,
  ProgressEvent,
  SaveApiKeyResult,
  TargetLang,
  TranslateOptions,
  TranslateResult,
  UsageInfo,
} from '../shared/types';

const api = {
  // Settings
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.hasApiKey),
  saveApiKey: (key: string): Promise<SaveApiKeyResult> =>
    ipcRenderer.invoke(IpcChannels.saveApiKey, key),
  getUsage: (): Promise<UsageInfo | null> => ipcRenderer.invoke(IpcChannels.getUsage),
  getLastTargetLang: (): Promise<TargetLang | null> =>
    ipcRenderer.invoke(IpcChannels.getLastTargetLang),
  setLastTargetLang: (lang: TargetLang): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setLastTargetLang, lang),
  getFormality: (): Promise<Formality> => ipcRenderer.invoke(IpcChannels.getFormality),
  setFormality: (formality: Formality): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.setFormality, formality),

  // Translation
  pickFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.pickFile),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  translate: (opts: TranslateOptions): Promise<TranslateResult> =>
    ipcRenderer.invoke(IpcChannels.translate, opts),
  cancelTranslation: (): Promise<void> => ipcRenderer.invoke(IpcChannels.cancelTranslation),
  onProgress(cb: (event: ProgressEvent) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, p: ProgressEvent) => cb(p);
    ipcRenderer.on(IpcChannels.progress, handler);
    return () => ipcRenderer.removeListener(IpcChannels.progress, handler);
  },

  // OS integration
  revealInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.revealInFolder, filePath),

  // Platform
  platform: process.platform as 'darwin' | 'win32' | 'linux',
};

contextBridge.exposeInMainWorld('api', api);

export type OgmaApi = typeof api;
