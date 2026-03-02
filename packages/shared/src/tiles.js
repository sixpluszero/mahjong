/**
 * 中文：牌面模型与编码工具。
 * 负责生成标准牌墙、在内部对象与短码之间转换、以及构建计数统计供规则引擎使用。
 * EN: Tile model and encoding helpers.
 * Provides deck creation, object/code conversion, and count aggregations used by rule evaluation.
 */

/** 中文：四川麻将三门花色枚举。EN: The three suited tile families used in this ruleset. */
export const SUITS = ['wan', 'tiao', 'tong'];

/** 中文：短码前缀到花色名映射（用于解析）。EN: Code-prefix -> suit mapping for parsing. */
const SUIT_CODE_MAP = {
  w: 'wan',
  t: 'tiao',
  b: 'tong'
};

/** 中文：花色名到短码前缀映射（用于序列化）。EN: Suit -> code-prefix mapping for serialization. */
const SUIT_PREFIX = {
  wan: 'w',
  tiao: 't',
  tong: 'b'
};

/**
 * 中文：生成完整牌墙（3 花色 * 9 点 * 每张 4 张 = 108 张）。
 * EN: Build the full wall (3 suits * 9 ranks * 4 copies = 108 tiles).
 */
export function createDeck() {
  const tiles = [];

  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({
          suit,
          rank,
          id: `${SUIT_PREFIX[suit]}${rank}-${copy}`
        });
      }
    }
  }

  return tiles;
}

/** 中文：将牌对象编码为短码（如 w5）。EN: Convert a tile object into a short code (e.g. w5). */
export function tileToCode(tile) {
  return `${SUIT_PREFIX[tile.suit]}${tile.rank}`;
}

/**
 * 中文：解析短码为牌对象；此函数只校验花色/点数，不关心真实物理副本 id。
 * EN: Parse short code into a tile object; validates suit/rank only, with a synthetic id placeholder.
 */
export function parseTileCode(code) {
  const suitCode = code[0];
  const rank = Number(code.slice(1));
  const suit = SUIT_CODE_MAP[suitCode];

  if (!suit || Number.isNaN(rank) || rank < 1 || rank > 9) {
    throw new Error(`Invalid tile code: ${code}`);
  }

  return {
    suit,
    rank,
    id: `${code}-x`
  };
}

/** 中文：批量解析短码列表。EN: Parse a list of tile codes in order. */
export function parseTileCodes(codes) {
  return codes.map(parseTileCode);
}

/**
 * 中文：将牌映射到 0~26 的线性下标，供计数数组使用。
 * EN: Map a tile into a 0..26 linear index for fixed-size count arrays.
 */
export function tileToIndex(tile) {
  const suitBase = SUITS.indexOf(tile.suit) * 9;

  if (suitBase < 0) {
    throw new Error(`Unknown suit: ${tile.suit}`);
  }

  return suitBase + tile.rank - 1;
}

/** 中文：构建 27 维牌频次数组。EN: Build a 27-slot frequency array for tile multiplicities. */
export function buildCounts(tiles) {
  const counts = Array(27).fill(0);

  for (const tile of tiles) {
    counts[tileToIndex(tile)] += 1;
  }

  return counts;
}

/** 中文：统计每门花色出现次数。EN: Count suit usage distribution for a tile list. */
export function listSuitUsage(tiles) {
  const usage = {
    wan: 0,
    tiao: 0,
    tong: 0
  };

  for (const tile of tiles) {
    usage[tile.suit] += 1;
  }

  return usage;
}
