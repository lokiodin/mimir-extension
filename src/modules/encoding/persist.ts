// Trailing-edge debounced writer for the encoding module's persisted state.
// flush() exists so an unmount inside the debounce window (e.g. switching
// module right after typing) still saves the last edit instead of dropping it.

export interface DebouncedWriter<T> {
  schedule(value: T): void;
  flush(): void;
}

export function createDebouncedWriter<T>(
  write: (value: T) => void,
  delayMs: number,
): DebouncedWriter<T> {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending === null) return;
    const { value } = pending;
    pending = null;
    write(value);
  }

  return {
    schedule(value) {
      pending = { value };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
