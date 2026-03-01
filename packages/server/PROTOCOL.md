# Mahjong WebSocket Protocol (v0)

Server URL: `ws://localhost:8787`

## Client -> Server
- `hello`: `{ name: string }`
- `create_room`: `{}`
- `join_room`: `{ roomId: string }`
- `set_ready`: `{ ready: boolean }`
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
- `room_state`: `{ roomId, hasGame, phase, rematchReadySeats, players[] }`
- `rooms_list`: `{ rooms: [{ roomId, occupied, capacity, hasGame, phase, canJoin }] }`
- `game_state`: `{ roomId, you, state, pendingReaction }`
- `error`: `{ code }`

## Notes
- Server is authoritative; client sends intents only.
- `game_state.you.hand` only includes the receiver's own hand.
- Room starts automatically when 4 seats are occupied and all set `ready=true`.
