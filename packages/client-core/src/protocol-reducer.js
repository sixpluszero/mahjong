/**
 * 中文：客户端协议消息归并器（UI 无关）。
 * 输入服务端消息，输出对客户端状态的纯数据更新与建议动作。
 * EN: UI-agnostic client protocol reducer.
 * Consumes server messages and returns pure state patches plus suggested follow-up actions.
 */

/**
 * @param {object} state
 * @param {{type:string,payload:any}} message
 * @returns {{patch?:object,effects?:Array<object>}}
 */
export function reduceServerMessage(state, message) {
  const { type, payload } = message;

  if (type === 'welcome') {
    return { patch: { clientId: payload.clientId } };
  }

  if (type === 'hello_ack') {
    return {
      patch: { name: payload.name },
      effects: [{ type: 'notice', message: `昵称已设置：${payload.name}` }]
    };
  }

  if (type === 'seat_assigned') {
    return {
      patch: {
        roomId: payload.roomId,
        resumeSession: {
          roomId: payload.roomId,
          seat: payload.seat,
          resumeToken: payload.resumeToken,
          name: payload.name
        }
      },
      effects: [{ type: 'persist_resume_session' }]
    };
  }

  if (type === 'resume_ack') {
    return {
      patch: { resumePending: false },
      effects: [{ type: 'notice', message: `已恢复座位：房间${payload.roomId} 座位${payload.seat}` }]
    };
  }

  if (type === 'room_state') {
    const patch = {
      roomState: payload,
      roomId: payload.roomId
    };

    if (payload.phase !== 'settlement') {
      patch.rematchRequested = false;
    }

    return {
      patch,
      effects: [{ type: 'send', messageType: 'list_rooms', payload: {} }]
    };
  }

  if (type === 'game_state') {
    return {
      patch: {
        gameState: payload.state,
        you: payload.you,
        pendingReaction: payload.pendingReaction,
        pendingDiscardTileId: null
      },
      effects: [{ type: 'track_latest_draw' }, { type: 'phase_change' }]
    };
  }

  if (type === 'rooms_list') {
    return { patch: { activeRooms: payload.rooms || [] } };
  }

  return {};
}
