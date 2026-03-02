# Mahjong WebSocket Protocol (v0)

Server URL: `ws://localhost:8787`

## Client -> Server
- `hello`: `{ name: string }`
- `create_room`: `{}`
- `join_room`: `{ roomId: string }`
- `resume_room`: `{ roomId: string, seat: number, resumeToken: string }`
- `set_ready`: `{ ready: boolean }`
- `add_bot`: `{}`
- `submit_exchange`: `{ tileIds: string[3] }`
- `set_lack`: `{ lackSuit: 'wan'|'tiao'|'tong' }`
- `discard`: `{ tileId: string }`
- `self_hu`: `{}`
- `an_gang`: `{ tileId: string }`
- `bu_gang`: `{ tileId: string }`
- `react`: `{ action: 'hu'|'gang'|'peng'|'pass' }`
- `get_state`: `{}`
- `list_rooms`: `{}`
- `request_rematch`: `{}`

## Server -> Client
- `welcome`: `{ clientId, now }`
- `hello_ack`: `{ clientId, name }`
- `seat_assigned`: `{ roomId, seat, name, resumeToken }`
- `resume_ack`: `{ roomId, seat, name }`
- `room_state`: `{ roomId, hasGame, phase, rematchReadySeats, roundNo, roundHistory, players[] }`
  - `players[].isBot` 标识机器人
  - `players[].online` 在线状态
  - `players[].auto` 是否处于托管（掉线后自动托管）
  - `players[].totalScore` 为房间累计总分（跨“再来一局”）
  - `roundHistory[]` 记录每局结算：局号、终局原因、每位玩家本局增减分与当时总分
  - `maxRounds` 房间总局数上限（默认 8）
  - `matchFinished` 是否已完成全部局数
  - `finalStandings[]` 完赛后最终排名
  - `idleCloseDeadlineAt` 无真人在线时的自动关房截止时间（毫秒时间戳）
- `rooms_list`: `{ rooms: [{ roomId, occupied, capacity, hasGame, phase, canJoin }] }`
- `game_state`: `{ roomId, you, state, pendingReaction }`
  - `you.canSelfHu`: 当前是否可自摸胡（用于前端显示按钮）
- `error`: `{ code }`

## Notes
- Server is authoritative; client sends intents only.
- `game_state.you.hand` only includes the receiver's own hand.
- Room starts automatically when 4 seats are occupied and all set `ready=true`.
