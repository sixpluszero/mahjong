import { buildCounts, listSuitUsage, SUITS } from './tiles.js';

const JIANG_RANKS = new Set([2, 5, 8]);

export function hasLackSuitTiles(tiles, lackSuit) {
  if (!lackSuit) {
    return false;
  }

  return tiles.some((tile) => tile.suit === lackSuit);
}

export function isDiscardAllowed(handTiles, discardTile, lackSuit) {
  if (!lackSuit) {
    return true;
  }

  const hasLack = hasLackSuitTiles(handTiles, lackSuit);
  return !hasLack || discardTile.suit === lackSuit;
}

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

export function calculateWinPayment({ fan, maxFan = 16, baseScore = 1 }) {
  const cappedFan = Math.min(fan, maxFan);
  return baseScore * (2 ** cappedFan);
}

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
