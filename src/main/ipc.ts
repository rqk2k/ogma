import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IpcChannels } from '../shared/ipcChannels';
import type {
  Formality,
  SaveApiKeyResult,
  TargetLang,
  TranslateErrorKind,
  TranslateOptions,
  TranslateResult,
  UsageInfo,
} from '../shared/types';
import * as settings from './settings';
import { DeepLError, fetchUsage } from './translate/deepl';
import { translateDocx } from './translate';

let currentJob: AbortController | null = null;

function mapTranslateError(e: unknown): { error: TranslateErrorKind; message: string } {
  if (e instanceof DeepLError) {
    switch (e.kind) {
      case 'invalid_key':
        return { error: 'invalid_key', message: 'API key was rejected.' };
      case 'quota_exceeded':
        return { error: 'quota_exceeded', message: 'Monthly translation quota exceeded.' };
      case 'aborted':
        return { error: 'cancelled', message: 'Cancelled.' };
      case 'rate_limited':
      case 'network':
        return { error: 'network', message: 'Could not reach the translation service.' };
      default:
        return { error: 'unknown', message: e.message };
    }
  }
  const err = e as NodeJS.ErrnoException;
  if (
    err.code === 'ENOENT' ||
    err.code === 'EACCES' ||
    err.code === 'EBADF' ||
    err.code === 'EISDIR' ||
    err.code === 'EPERM'
  ) {
    return { error: 'fs', message: `Could not read or write the file: ${err.message}` };
  }
  const msg = err.message ?? '';
  if (
    msg.includes("Can't find end of central directory") ||
    msg.includes('Corrupted zip') ||
    msg.toLowerCase().includes('not a zip') ||
    msg.includes('Invalid XML')
  ) {
    return { error: 'parse', message: 'This file does not appear to be a valid .docx.' };
  }
  return { error: 'unknown', message: msg || 'Unknown error' };
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.hasApiKey, (): boolean => settings.hasApiKey());

  ipcMain.handle(
    IpcChannels.saveApiKey,
    async (_event, plainKey: string): Promise<SaveApiKeyResult> => {
      if (!settings.isEncryptionAvailable()) {
        return {
          ok: false,
          error: 'encryption_unavailable',
          message: 'Secure storage is not available on this system.',
        };
      }

      const trimmed = plainKey.trim();
      if (!trimmed) {
        return { ok: false, error: 'invalid_key', message: 'Key is empty.' };
      }

      try {
        const usage = await fetchUsage(trimmed);
        settings.saveApiKey(trimmed);
        return { ok: true, usage };
      } catch (e) {
        if (e instanceof DeepLError) {
          if (e.kind === 'invalid_key') {
            return { ok: false, error: 'invalid_key', message: 'API key was rejected.' };
          }
          if (e.kind === 'network') {
            return { ok: false, error: 'network', message: 'Could not reach the service.' };
          }
        }
        return { ok: false, error: 'unknown', message: (e as Error).message };
      }
    },
  );

  ipcMain.handle(IpcChannels.getUsage, async (): Promise<UsageInfo | null> => {
    const key = settings.getApiKey();
    if (!key) return null;
    try {
      return await fetchUsage(key);
    } catch {
      return null;
    }
  });

  ipcMain.handle(IpcChannels.getLastTargetLang, (): TargetLang | null =>
    settings.getLastTargetLang(),
  );

  ipcMain.handle(IpcChannels.setLastTargetLang, (_e, lang: TargetLang): void => {
    settings.setLastTargetLang(lang);
  });

  ipcMain.handle(IpcChannels.getFormality, (): Formality => settings.getFormality());

  ipcMain.handle(IpcChannels.setFormality, (_e, formality: Formality): void => {
    settings.setFormality(formality);
  });

  ipcMain.handle(IpcChannels.pickFile, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [{ name: 'Word Documents', extensions: ['docx'] }],
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Word Documents', extensions: ['docx'] }],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.revealInFolder, async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(
    IpcChannels.translate,
    async (event, opts: TranslateOptions): Promise<TranslateResult> => {
      if (currentJob) {
        return { ok: false, error: 'busy', message: 'A translation is already running.' };
      }
      const apiKey = settings.getApiKey();
      if (!apiKey) {
        return { ok: false, error: 'no_key', message: 'No API key configured.' };
      }

      const controller = new AbortController();
      currentJob = controller;
      try {
        const result = await translateDocx({
          inputPath: opts.filePath,
          targetLang: opts.targetLang,
          formality: settings.getFormality(),
          apiKey,
          signal: controller.signal,
          onProgress: (e) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send(IpcChannels.progress, e);
            }
          },
        });
        return { ok: true, outputPath: result.outputPath };
      } catch (e) {
        return { ok: false, ...mapTranslateError(e) };
      } finally {
        currentJob = null;
      }
    },
  );

  ipcMain.handle(IpcChannels.cancelTranslation, () => {
    currentJob?.abort();
  });
}
