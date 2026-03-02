import { buildCounts, listSuitUsage, SUITS } from './tiles.js';

/**
 * 中文：四川麻将核心规则判定模块。
 * 职责：缺门约束、和牌形态识别、番型累计、以及番数到支付倍率的转换。
 * EN: Core Sichuan-mahjong rules engine.
 * Responsibilities: lack-suit constraints, hand-shape detection, fan aggregation, and payment scaling.
 */

/** 中文：将牌可用点数（将对）集合。EN: Allowed pair ranks for Jiang Dui pattern. */
const JIANG_RANKS = new Set([2, 5, 8]);

/** 中文：检查手牌中是否仍含“缺门”花色。EN: Check whether hand still contains the declared lack suit. */
export function hasLackSuitTiles(tiles, lackSuit) {
  if (!lackSuit) {
    return false;
  }

  return tiles.some((tile) => tile.suit === lackSuit);
}

/**
 * 中文：出牌合法性校验：若仍有缺门牌，必须先打缺门。
 * EN: Discard legality check: if lack-suit tiles still exist, discard must come from that suit first.
 */
export function isDiscardAllowed(handTiles, discardTile, lackSuit) {
  if (!lackSuit) {
    return true;
  }

  const hasLack = hasLackSuitTiles(handTiles, lackSuit);
  return !hasLack || discardTile.suit === lackSuit;
}

/**
 * 中文：识别 14 张牌是否构成可胡牌型（七对或标准 4 面子 + 1 将）。
 * EN: Detect whether 14 tiles form a winning shape (seven pairs or standard 4 melds + 1 pair).
 */
export function detectWinShape(tiles) {
  if (tiles.length !== 14) {
    return {
      isWin: false,
      winType: null,
      details: {}
    };
  }

  const counts = buildCounts(tiles);
  const sevenPairs = detectSevenPairs(counts);

  if (sevenPairs.isSevenPairs) {
    return {
      isWin: true,
      winType: 'seven_pairs',
      details: sevenPairs
    };
  }

  const standard = detectStandardHand(counts);

  if (standard.isStandard) {
    return {
      isWin: true,
      winType: 'standard',
      details: standard
    };
  }

  return {
    isWin: false,
    winType: null,
    details: {}
  };
}

/**
 * 中文：综合评估可胡性与番型明细。
 * 输入：完整牌集合、上下文（自摸/杠上等）、缺门信息与封顶配置。
 * 输出：是否可胡、原始番、封顶番、倍率、命中牌型与失败原因。
 * EN: Evaluate whether the hand can win and compute detailed fan breakdown.
 * Inputs: full tiles, win context flags, lack-suit info, and fan cap config.
 * Output: win flag, raw/capped fan, multiplier, matched patterns, and failure reason.
 */
export function evaluateFans({
  tiles,
  context = {},
  lackSuit = null,
  config = {}
}) {
  const maxFan = config.maxFan ?? 16;
  const minFan = config.minFan ?? 1;

  if (hasLackSuitTiles(tiles, lackSuit)) {
    return {
      canHu: false,
      fan: 0,
      cappedFan: 0,
      multiplier: 0,
      patterns: [],
      reason: 'HAS_LACK_SUIT_TILES'
    };
  }

  const shape = detectWinShape(tiles);

  if (!shape.isWin) {
    return {
      canHu: false,
      fan: 0,
      cappedFan: 0,
      multiplier: 0,
      patterns: [],
      reason: 'NOT_WIN_SHAPE'
    };
  }

  const suitUsage = listSuitUsage(tiles);
  const isPureOneSuit = SUITS.filter((suit) => suitUsage[suit] > 0).length === 1;
  const isAllTriplets = detectAllTriplets(buildCounts(tiles));
  const allRanks = tiles.map((tile) => tile.rank);
  const isJiangDui = isAllTriplets && allRanks.every((rank) => JIANG_RANKS.has(rank));
  const isYaoJiu = isAllTriplets && allRanks.every((rank) => rank === 1 || rank === 9);

  const primaryCandidates = [];

  if (shape.winType === 'seven_pairs') {
    if (shape.details.hasDragonPair) {
      primaryCandidates.push({ key: 'long_qi_dui', fan: 4 });
    } else {
      primaryCandidates.push({ key: 'qi_dui', fan: 2 });
    }
  }

  if (shape.winType === 'standard') {
    if (isAllTriplets) {
      primaryCandidates.push({ key: 'peng_peng_hu', fan: 2 });
    } else {
      primaryCandidates.push({ key: 'ping_hu', fan: 1 });
    }
  }

  if (isJiangDui) {
    primaryCandidates.push({ key: 'jiang_dui', fan: 4 });
  }

  if (isYaoJiu) {
    primaryCandidates.push({ key: 'yao_jiu', fan: 4 });
  }

  let primary = { key: 'ping_hu', fan: 1 };
  for (const candidate of primaryCandidates) {
    if (candidate.fan > primary.fan) {
      primary = candidate;
    }
  }

  const patterns = [primary.key];
  let fan = primary.fan;

  if (isPureOneSuit) {
    patterns.push('qing_yi_se');
    fan += 4;
  }

  if (context.selfDraw) {
    patterns.push('zi_mo');
    fan += 1;
  }

  const isMenQing = context.menQing ?? true;
  if (isMenQing) {
    patterns.push('men_qing');
    fan += 1;
  }

  if (context.kongDraw) {
    patterns.push('gang_shang_hua');
    fan += 1;
  }

  if (context.kongPao) {
    patterns.push('gang_shang_pao');
    fan += 1;
  }

  if (context.robbedKong) {
    patterns.push('qiang_gang_hu');
    fan += 1;
  }

  if (context.lastTileDraw) {
    patterns.push('hai_di_lao_yue');
    fan += 1;
  }

  if (context.lastTileDiscard) {
    patterns.push('hai_di_pao');
    fan += 1;
  }

  if (context.heavenlyWin) {
    patterns.push('tian_hu');
    fan += 6;
  }

  if (context.earthlyWin) {
    patterns.push('di_hu');
    fan += 6;
  }

  if (fan < minFan) {
    return {
      canHu: false,
      fan,
      cappedFan: Math.min(fan, maxFan),
      multiplier: 0,
      patterns,
      reason: 'BELOW_MIN_FAN'
    };
  }

  const cappedFan = Math.min(fan, maxFan);

  return {
    canHu: true,
    fan,
    cappedFan,
    multiplier: 2 ** cappedFan,
    patterns,
    reason: null
  };
}

/** 中文：将番数映射为实际支付分。EN: Convert fan to concrete payment amount. */
export function calculateWinPayment({ fan, maxFan = 16, baseScore = 1 }) {
  const cappedFan = Math.min(fan, maxFan);
  return baseScore * (2 ** cappedFan);
}

/** 中文：七对检测（四张同牌按两对并标记龙七对）。EN: Seven-pairs detector with dragon-pair handling for quads. */
function detectSevenPairs(counts) {
  let pairUnits = 0;
  let hasDragonPair = false;

  for (const count of counts) {
    if (count === 0) {
      continue;
    }

    if (count !== 2 && count !== 4) {
      return {
        isSevenPairs: false,
        hasDragonPair: false
      };
    }

    if (count === 2) {
      pairUnits += 1;
    }

    if (count === 4) {
      pairUnits += 2;
      hasDragonPair = true;
    }
  }

  return {
    isSevenPairs: pairUnits === 7,
    hasDragonPair
  };
}

/** 中文：标准和牌检测：枚举将牌后验证剩余是否可拆为面子。EN: Standard hand detection by trying every possible pair first. */
function detectStandardHand(counts) {
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] < 2) {
      continue;
    }

    const remaining = [...counts];
    remaining[i] -= 2;

    if (canFormAllMelds(remaining)) {
      return {
        isStandard: true,
        pairIndex: i
      };
    }
  }

  return {
    isStandard: false,
    pairIndex: -1
  };
}

/** 中文：碰碰胡检测：去将后剩余计数需全部为 3 的倍数。EN: All-triplets check after removing one pair candidate. */
function detectAllTriplets(counts) {
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] < 2) {
      continue;
    }

    const remaining = [...counts];
    remaining[i] -= 2;

    let valid = true;
    for (const count of remaining) {
      if (count % 3 !== 0) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return true;
    }
  }

  return false;
}

/** 中文：按花色拆分后分别验证能否完全组成面子。EN: Validate meld-composability suit by suit. */
function canFormAllMelds(counts) {
  for (let suit = 0; suit < 3; suit += 1) {
    const start = suit * 9;
    const suitCounts = counts.slice(start, start + 9);

    if (!canFormSuitMelds(suitCounts)) {
      return false;
    }
  }

  return true;
}

/**
 * 中文：单门花色递归回溯：
 * 优先尝试刻子与顺子分解，任一路径可完全清空即成立。
 * EN: Recursive suit-level backtracking:
 * try triplet/sequence decomposition; success when one path consumes all counts.
 */
function canFormSuitMelds(suitCounts) {
  const first = suitCounts.findIndex((count) => count > 0);

  if (first === -1) {
    return true;
  }

  if (suitCounts[first] >= 3) {
    const next = [...suitCounts];
    next[first] -= 3;

    if (canFormSuitMelds(next)) {
      return true;
    }
  }

  if (first <= 6 && suitCounts[first + 1] > 0 && suitCounts[first + 2] > 0) {
    const next = [...suitCounts];
    next[first] -= 1;
    next[first + 1] -= 1;
    next[first + 2] -= 1;

    if (canFormSuitMelds(next)) {
      return true;
    }
  }

  return false;
}
