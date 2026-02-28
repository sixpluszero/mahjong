export const SUITS = ['wan', 'tiao', 'tong'];

const SUIT_CODE_MAP = {
  w: 'wan',
  t: 'tiao',
  b: 'tong'
};

const SUIT_PREFIX = {
  wan: 'w',
  tiao: 't',
  tong: 'b'
};

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

export function tileToCode(tile) {
  return `${SUIT_PREFIX[tile.suit]}${tile.rank}`;
}

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

export function parseTileCodes(codes) {
  return codes.map(parseTileCode);
}

export function tileToIndex(tile) {
  const suitBase = SUITS.indexOf(tile.suit) * 9;

  if (suitBase < 0) {
    throw new Error(`Unknown suit: ${tile.suit}`);
  }

  return suitBase + tile.rank - 1;
}

export function buildCounts(tiles) {
  const counts = Array(27).fill(0);

  for (const tile of tiles) {
    counts[tileToIndex(tile)] += 1;
  }

  return counts;
}

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
