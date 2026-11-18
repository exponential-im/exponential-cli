import { createConfigStore } from 'exponential-sdk';
import type { ExponentialConfig } from 'exponential-sdk';

const configStore = createConfigStore({ projectName: 'exponential-cli' });

export type { ExponentialConfig };

/**
 * Credentials from the environment, for agent software that shells out to the
 * CLI and would rather not write a config file (thick.marsh). Any token works:
 * a personal JWT or an external-agent key (`exp_agent_…`). The CLI treats it as
 * opaque and never parses an expiry from it — the server decides.
 *
 * `EXPONENTIAL_API_URL` is read only together with `EXPONENTIAL_TOKEN`, so a
 * shell that exports it for the MCP server doesn't silently re-point a
 * logged-in CLI. Without it the stored API URL is used.
 */
export const TOKEN_ENV = 'EXPONENTIAL_TOKEN';
export const API_URL_ENV = 'EXPONENTIAL_API_URL';

export type CredentialSource = 'env' | 'config';

/** Same normalisation as `auth login`: no trailing slash, https unless localhost. */
export function normalizeApiUrl(url: string): string {
  let apiUrl = url.trim().replace(/\/+$/, '');
  if (apiUrl && !apiUrl.startsWith('http://localhost') && !apiUrl.startsWith('https://')) {
    apiUrl = `https://${apiUrl}`;
  }
  return apiUrl;
}

function envToken(): string | undefined {
  const token = process.env[TOKEN_ENV]?.trim();
  return token ? token : undefined;
}

/** The stored config only, ignoring the environment. */
export function getStoredConfig(): ExponentialConfig {
  return configStore.loadConfig();
}

/** The credentials every command uses: `EXPONENTIAL_TOKEN` wins over the stored token. */
export function getConfig(): ExponentialConfig {
  const stored = configStore.loadConfig();
  const token = envToken();
  if (!token) return stored;
  const envUrl = process.env[API_URL_ENV]?.trim();
  return {
    ...stored,
    token,
    apiUrl: envUrl ? normalizeApiUrl(envUrl) : stored.apiUrl,
  };
}

/** Where the token in use comes from, or null when there is none. */
export function getCredentialSource(): CredentialSource | null {
  if (envToken()) return 'env';
  return configStore.isAuthenticated() ? 'config' : null;
}

export function setConfig(values: Partial<ExponentialConfig>): void {
  configStore.saveConfig(values);
}

export function clearConfig(): void {
  configStore.clearConfig();
}

export function isAuthenticated(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.token && cfg.apiUrl);
}

export function getConfigPath(): string {
  return configStore.getConfigPath();
}
