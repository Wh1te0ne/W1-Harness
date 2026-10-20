/** Preload before Host imports; retry only transient file-read EBUSY, never application work. */
export const HOST_MODULE_RETRY_IMPORT = 'data:text/javascript,' + encodeURIComponent(`
import { registerHooks } from 'node:module';
const sleep = new Int32Array(new SharedArrayBuffer(4));
registerHooks({
  load(url, context, nextLoad) {
    for (let attempt = 0; ; attempt++) {
      try { return nextLoad(url, context); }
      catch (error) {
        if (!url.startsWith('file:') || error?.code !== 'EBUSY' || attempt >= 20) throw error;
        Atomics.wait(sleep, 0, 0, 50);
      }
    }
  }
});
`)
