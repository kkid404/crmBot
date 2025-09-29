const { google } = require('googleapis');
const Bottleneck = require('bottleneck');
const path = require('path');
const credentials = require(path.join(process.cwd(), 'credentials.json'));

/**
 * Google Sheets helper
 *  • write‑лимитер (≤ 60 write‑rq/мин на пользователя)
 *  • read‑лимитер  (≤ 180 read‑rq/мин)
 *  • in‑memory cache для метаданных листов
 */
class GoogleSheetsService {
  constructor () {
    /* ---------- auth ---------- */
    this.auth   = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.drive  = google.drive({  version: 'v3', auth: this.auth });

    /* ---------- лимитеры ---------- */
    this.writeLimiter = new Bottleneck({
      reservoir               : 60,
      reservoirRefreshAmount  : 60,
      reservoirRefreshInterval: 60_000,
      maxConcurrent           : 1
    });

    // Allow a bit more parallelism for reads to avoid unnecessary queueing
    this.readLimiter = new Bottleneck({
      reservoir               : 180,
      reservoirRefreshAmount  : 180,
      reservoirRefreshInterval: 60_000,
      maxConcurrent           : 3
    });

    // Default timeout for Google API requests (via gaxios)
    this._timeoutMs = Number(process.env.GOOGLE_API_TIMEOUT_MS ?? 30_000);
    // Set global gaxios options for googleapis so it does NOT become a query param
    google.options({ timeout: this._timeoutMs });

    // Exponential backoff for rate limits (429), 5xx, and common network errors
    const transientCodes = new Set([429, 500, 502, 503, 504]);
    const networkCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);
    const backoff = (err, info) => {
      const code = err?.code ?? err?.response?.status;
      const shouldRetry = transientCodes.has(code) || networkCodes.has(code);
      if (shouldRetry && info.retryCount < 5) {
        return 1_000 * 2 ** info.retryCount; // 1 → 2 → 4 → 8 → 16 → 32 s
      }
      return undefined;
    };

    this.writeLimiter.on('failed', backoff);
    this.readLimiter .on('failed', backoff);

    /* ---------- patch helpers ---------- */
    const wrapWrite = (obj, method) => {
      if (!obj[method]) return; // skip if API version changed
      const orig = obj[method].bind(obj);
      // Do NOT inject timeout into params (it becomes a query string). We use global google.options instead.
      const limited = this.writeLimiter.wrap(orig);
      obj[method] = limited;
      return obj[method];
    };

    const wrapRead = (obj, method) => {
      if (!obj[method]) return;
      const orig = obj[method].bind(obj);
      obj[method] = this.readLimiter.wrap(orig);
    };

    /* ---------- globally patch WRITE API calls ---------- */
    this._create       = wrapWrite(this.sheets.spreadsheets,        'create');
    this._batchUpdate  = wrapWrite(this.sheets.spreadsheets,        'batchUpdate');
    this._valuesUpdate = wrapWrite(this.sheets.spreadsheets.values, 'update');
    this._valuesClear  = wrapWrite(this.sheets.spreadsheets.values, 'clear');
    wrapWrite(this.sheets.spreadsheets.values, 'append');
    this._permCreate   = wrapWrite(this.drive.permissions,          'create');

    /* ---------- globally patch READ API calls ---------- */
    wrapRead(this.sheets.spreadsheets,        'get');
    wrapRead(this.sheets.spreadsheets.values, 'get');
    wrapRead(this.sheets.spreadsheets.values, 'batchGet');

    /* ---------- cache ---------- */
    this._sheetCache = new Map(); // spreadsheetId → { meta, ts, fields }
    this._cacheTTL   = Number(process.env.SHEETS_META_CACHE_TTL ?? 3_600_000); // default 1 ч
  }

  /* ===== utils ===== */
  async _getSpreadsheetMeta (spreadsheetId, fields = 'sheets.properties') {
    const now   = Date.now();
    const cache = this._sheetCache.get(spreadsheetId);

    if (cache && now - cache.ts < this._cacheTTL && cache.fields === fields) {
      return cache.meta;
    }

    const meta = await this.sheets.spreadsheets.get({ spreadsheetId, fields });
    this._sheetCache.set(spreadsheetId, { meta: meta.data, ts: now, fields });
    return meta.data;
  }

  _invalidateCache (spreadsheetId) {
    this._sheetCache.delete(spreadsheetId);
  }

  /* ===== SPREADSHEET ===== */
  async createSpreadsheet (title) {
    const rsp = await this._create({
      requestBody: {
        properties: { title, locale: 'ru_RU' },
        sheets: [{ properties: { title: 'Лист 1', gridProperties: { rowCount: 1_000, columnCount: 26 } } }]
      }
    });

    const spreadsheetId = rsp.data.spreadsheetId;

    await this._permCreate({
      fileId: spreadsheetId,
      requestBody: { role: 'writer', type: 'anyone' },
      supportsAllDrives: true,
      sendNotificationEmail: false
    });

    return spreadsheetId;
  }

  async getOrCreateSpreadsheet (title, envId) {
    if (!envId) return this.createSpreadsheet(title);

    try {
      await this.sheets.spreadsheets.get({ spreadsheetId: envId, fields: 'properties.title' });
      if (title) {
        await this._batchUpdate({
          spreadsheetId: envId,
          requestBody: { requests: [{ updateSpreadsheetProperties: { properties: { title }, fields: 'title' } }] }
        });
      }
      return envId;
    } catch (err) {
      console.warn(`Нет доступа к таблице ${envId}: ${err.message}. Создаём новую.`);
      return this.createSpreadsheet(title);
    }
  }

  /* ===== SHEETS ===== */
  async _sheetExists (spreadsheetId, title) {
    const meta = await this._getSpreadsheetMeta(spreadsheetId);
    return (meta.sheets || []).some(s => s.properties.title === title);
  }

  async addSheet (spreadsheetId, title) {
    if (await this._sheetExists(spreadsheetId, title)) {
      console.log(`Лист "${title}" уже существует – пропуск.`);
      return;
    }

    await this._batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: 1_000, columnCount: 26 } } } }] }
    });
    this._invalidateCache(spreadsheetId);
    console.log(`Создан лист "${title}"`);
  }

  async deleteSheet (spreadsheetId, sheetId) {
    await this._batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId } }] } });
    this._invalidateCache(spreadsheetId);
  }

  async deleteSheetByTitle (spreadsheetId, title) {
    const meta = await this._getSpreadsheetMeta(spreadsheetId);
    const sheet = meta.sheets.find(s => s.properties.title === title);
    if (sheet) await this.deleteSheet(spreadsheetId, sheet.properties.sheetId);
  }

  async prepareSheet (spreadsheetId, title) {
    const meta = await this._getSpreadsheetMeta(spreadsheetId);
    const sheet = meta.sheets.find(s => s.properties.title === title);

    if (!sheet) return this.addSheet(spreadsheetId, title);

    await this._batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { deleteSheet: { sheetId: sheet.properties.sheetId } },
          { addSheet   : { properties: { title, gridProperties: { rowCount: 1_000, columnCount: 26 } } } }
        ]
      }
    });
    this._invalidateCache(spreadsheetId);
  }

  /* ===== DATA ===== */
  async writeData (spreadsheetId, range, values) {
    await this._valuesUpdate({ spreadsheetId, range, valueInputOption: 'RAW', requestBody: { values } });
  }

  async clearSheet (spreadsheetId, title) {
    const meta  = await this._getSpreadsheetMeta(spreadsheetId, 'sheets.properties(sheetId,title)');
    const sheet = meta.sheets.find(s => s.properties.title === title);
    if (!sheet) return;

    await this._valuesClear({ spreadsheetId, range: `${title}!A1:Z1000` });

    await this._batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ updateCells: { range: { sheetId: sheet.properties.sheetId }, fields: 'userEnteredFormat' } }]
      }
    });
  }
}

module.exports = new GoogleSheetsService();
