const TIMEOUT = 10_000;

/** 呼び出し側の中断に 10 秒の打ち切りを足す。打ち切りは TimeoutError（DOMException） */
export function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
