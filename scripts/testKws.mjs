const message = 'gợi ý các sản phẩm liên quan tới thịt';
const STOP_WORDS = new Set(['smartfood', 'có', 'bán', 'cho', 'tôi', 'của', 'và', 'hay', 'hoặc', 'không', 'bao', 'nhiêu', 'thế', 'nào', 'loại', 'cái', 'này', 'kia']);
const kws = message
  .replace(/[?!.,;:"']/g, ' ')
  .split(' ')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  .slice(0, 5);
console.log('kws:', kws);
