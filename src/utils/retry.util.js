const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 секунда

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOperation(operation, maxRetries = MAX_RETRIES, delay = RETRY_DELAY) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error; // последняя попытка — пробрасываем

      // ECONNRESET: краткая задержка и повтор
      if (error?.code === 'ECONNRESET' || error?.message === 'read ECONNRESET') {
        console.log(`ECONNRESET: попытка ${i + 1}/${maxRetries}, повтор через ${delay}мс...`);
        await sleep(delay);
        continue;
      }

      // Telegram 429 Too Many Requests (FloodWait) — учитываем retry_after
      const isTooManyRequests = (
        error?.response?.error_code === 429 ||
        error?.code === 429 ||
        error?.code === 420 ||
        /Too Many Requests/i.test(error?.message || '')
      );
      if (isTooManyRequests) {
        const retryAfterSec = error?.parameters?.retry_after ?? Math.min(2 ** i, 32);
        const waitMs = retryAfterSec * 1000;
        console.log(`429/FloodWait: ожидание ${waitMs}мс (попытка ${i + 1}/${maxRetries})...`);
        await sleep(waitMs);
        continue;
      }

      // Прочие ошибки — без ретраев
      throw error;
    }
  }
}

module.exports = { retryOperation, sleep, MAX_RETRIES, RETRY_DELAY };
