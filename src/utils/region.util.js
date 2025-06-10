/**
 * Извлекает ISO-3166 α-2 регион из имени задачи.
 * Поддерживает форматы:
 *   • AA_dd_mm_yyyy_n
 *   • DU_AA_dd_mm_yyyy_n
 *   • “AA – …”, “AA/ …” (старые задания)
 * Возвращает 'GENERAL', если не удалось распознать.
 */
module.exports = function extractRegion(taskName = '') {
    if (!taskName) return 'GENERAL';
  
    // 1. Разбиваем по '_' и берём первый валидный токен, игнорируя служебные 'DU'
    const tokens = taskName.split('_');
    for (const tok of tokens) {
      const part = tok.trim().toUpperCase();
      if (part === 'DU') continue;            // технический префикс
      if (/^[A-Z]{2}$/.test(part)) return part;
    }
  
    // 2. Поддержка очень старых имён с '-', '–', '/'
    const legacy = taskName.split(/[-–/]/)[0].trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(legacy)) return legacy;
  
    return 'GENERAL';
  };