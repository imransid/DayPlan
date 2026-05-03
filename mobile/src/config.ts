import { Platform } from 'react-native';

/**
 * App configuration. Reads from .env via react-native-config (baked at native build time).
 * Does not import `react-native-config` default entry — that file calls `getConfig()` at load
 * time and throws when `RNCConfigModule` is not yet available (e.g. New Architecture / NOBRIDGE).
 */

function defaultApiUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api';
  return 'http://localhost:3000/api';
}

function readNativeConfig(): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NativeModule = require('react-native-config/codegen/NativeConfigModule').default;
    if (NativeModule == null || typeof NativeModule.getConfig !== 'function') {
      return {};
    }
    const payload = NativeModule.getConfig();
    const cfg = payload && typeof payload === 'object' && 'config' in payload ? payload.config : null;
    return cfg != null && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const nativeConfig = readNativeConfig();

const envApiUrlRaw = nativeConfig.API_URL;
const envApiUrl =
  typeof envApiUrlRaw === 'string' && envApiUrlRaw.length > 0 ? envApiUrlRaw : undefined;

export const config = {
  apiUrl: envApiUrl ?? defaultApiUrl(),
  deepLinkScheme: 'dayplan://',
} as const;
