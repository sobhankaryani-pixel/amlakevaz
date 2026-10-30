// API responses only (JSON / CSV exports); image/video playback stays streamed.
// Keep admin/src/http.ts identical: each app is deployed from its own directory.
export const API_TIMEOUT_MS = 60_000;
export const UPLOAD_TIMEOUT_MS = 180_000;
export type TimedRequestInit = RequestInit & {timeoutMs?: number};

export class RequestTimeoutError extends Error {
 constructor(write: boolean) {
  super(write
   ? 'پاسخ سرور به‌موقع نرسید. ممکن است درخواست ثبت شده باشد؛ پیش از ارسال دوباره، نتیجه را بررسی کنید.'
   : 'دریافت اطلاعات بیش از حد طول کشید. اتصال اینترنت را بررسی کنید و «تلاش مجدد» را بزنید.');
  this.name = 'RequestTimeoutError';
 }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: TimedRequestInit = {}): Promise<Response> {
 const {timeoutMs = API_TIMEOUT_MS, signal: suppliedSignal, ...options} = init;
 if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid request timeout');
 const callerSignal = suppliedSignal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
 const aborted = () => callerSignal?.reason ?? new DOMException('Request cancelled', 'AbortError');
 if (callerSignal?.aborted) throw aborted();
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 let cancelCaller: (() => void) | undefined;
 const method = (options.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
 const deadline = new Promise<never>((_, reject) => {
  cancelCaller = () => {const reason = aborted(); controller.abort(reason); reject(reason)};
  callerSignal?.addEventListener('abort', cancelCaller, {once: true});
  timer = setTimeout(() => {
   const error = new RequestTimeoutError(!['GET', 'HEAD'].includes(method));
   controller.abort(error);
   reject(error);
  }, timeoutMs);
 });
 const transfer = async () => {
  const response = await globalThis.fetch(input, {...options, signal: controller.signal});
  // Fetch resolves at headers. Keep the deadline active until the complete API
  // body arrives, including stalled JSON and exports. Return the original Response
  // so existing status/header/error handling and json()/blob() callers still work.
  await response.clone().arrayBuffer();
  return response;
 };
 try {
  return await Promise.race([transfer(), deadline]);
 } catch (error) {
  if (controller.signal.aborted) throw controller.signal.reason;
  if (error instanceof TypeError) throw new Error('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
  throw error;
 } finally {
  if (timer !== undefined) clearTimeout(timer);
  if (cancelCaller) callerSignal?.removeEventListener('abort', cancelCaller);
 }
}
