import type { AppConfig } from '../../types.js';

export interface GuiApiResult<T> {
  ok: true;
  data: T;
}

export interface GuiApiError {
  ok: false;
  error: string;
}

export type GuiApiResponse<T> = GuiApiResult<T> | GuiApiError;

export interface MimoGuiApi {
  load(): Promise<GuiApiResponse<AppConfig>>;
  refreshAll(): Promise<GuiApiResponse<AppConfig>>;
  login(input?: { name?: string; label?: string }): Promise<GuiApiResponse<AppConfig>>;
  addFromCookie(input: { name: string; label?: string; cookieHeader: string }): Promise<GuiApiResponse<AppConfig>>;
  setDefault(accountId: string): Promise<GuiApiResponse<AppConfig>>;
  renameLabel(accountId: string, label: string): Promise<GuiApiResponse<AppConfig>>;
  remove(accountId: string): Promise<GuiApiResponse<AppConfig>>;
}

export async function unwrap<T>(response: GuiApiResponse<T>): Promise<T> {
  if (response.ok) {
    return response.data;
  }
  throw new Error(response.error);
}

declare global {
  interface Window {
    mimo: MimoGuiApi;
  }
}
