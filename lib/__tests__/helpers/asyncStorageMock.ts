/**
 * In-memory stand-in for `@react-native-async-storage/async-storage`.
 *
 * The real package is a native module: importing it under vitest pulls in
 * react-native and fails to parse, so any suite covering the disk-cache layers
 * (timeline prefetch, browse/shared caches, the has-launched flag) has to
 * `vi.mock` it. Backed by a Map so a test can seed a warm cache and then assert
 * on what the code under test wrote back.
 *
 * Usage:
 *
 *   const store = createAsyncStorageMock();
 *   vi.mock("@react-native-async-storage/async-storage", () => ({ default: store }));
 *   store.seed("timeline_cache_v1_u1", JSON.stringify(rows));
 */
import { vi } from "vitest";

export interface AsyncStorageMock {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  multiRemove: ReturnType<typeof vi.fn>;
  multiGet: ReturnType<typeof vi.fn>;
  getAllKeys: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  /** Direct access for assertions: `expect(store.map.get(key)).toBe(...)`. */
  map: Map<string, string>;
  /** Write a value without going through the spied setter. */
  seed(key: string, value: string): void;
  /** Empty the store and clear all call history. */
  reset(): void;
}

export function createAsyncStorageMock(): AsyncStorageMock {
  const map = new Map<string, string>();

  const getItem = vi.fn(async (key: string): Promise<string | null> =>
    map.has(key) ? map.get(key)! : null
  );
  const setItem = vi.fn(async (key: string, value: string): Promise<void> => {
    map.set(key, value);
  });
  const removeItem = vi.fn(async (key: string): Promise<void> => {
    map.delete(key);
  });
  const multiRemove = vi.fn(async (keys: readonly string[]): Promise<void> => {
    for (const key of keys) map.delete(key);
  });
  const multiGet = vi.fn(async (keys: readonly string[]) =>
    keys.map((key) => [key, map.has(key) ? map.get(key)! : null] as [string, string | null])
  );
  const getAllKeys = vi.fn(async () => [...map.keys()]);
  const clear = vi.fn(async (): Promise<void> => {
    map.clear();
  });

  const mock: AsyncStorageMock = {
    getItem,
    setItem,
    removeItem,
    multiRemove,
    multiGet,
    getAllKeys,
    clear,
    map,
    seed(key, value) {
      map.set(key, value);
    },
    reset() {
      map.clear();
      for (const fn of [
        getItem,
        setItem,
        removeItem,
        multiRemove,
        multiGet,
        getAllKeys,
        clear,
      ]) {
        fn.mockClear();
      }
    },
  };

  return mock;
}
