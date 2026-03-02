/**
 * 中文：共享核心模块导出入口，统一对外暴露牌定义、规则计算和对局状态机能力。
 * EN: Shared core barrel module that re-exports tile helpers, rules, and game state machine APIs.
 */

/** 中文：牌相关数据结构与转换工具。EN: Tile data structures and conversion utilities. */
export {
  SUITS,
  createDeck,
  parseTileCode,
  parseTileCodes,
  tileToCode,
  tileToIndex,
  buildCounts,
  listSuitUsage
} from './tiles.js';

/** 中文：胡牌判定与番型/支付计算规则。EN: Win validation plus fan/payment rule evaluators. */
export {
  hasLackSuitTiles,
  isDiscardAllowed,
  detectWinShape,
  evaluateFans,
  calculateWinPayment
} from './rules.js';

/** 中文：回合状态机操作接口。EN: Public operations for driving round state transitions. */
export {
  createInitialGame,
  submitExchangeSelection,
  assignLackSuit,
  discardTile,
  resolveReactions,
  declareSelfDrawHu,
  canDeclareSelfDrawHu,
  declareAnGang,
  declareBuGang,
  drawTileForSeat,
  getPublicSnapshot
} from './game.js';
