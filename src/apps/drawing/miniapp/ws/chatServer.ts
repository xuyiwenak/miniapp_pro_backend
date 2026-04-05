import type { WebSocket } from "ws";
import { getMessageStore } from "../messageStore";
import { gameLogger } from "../../../../util/logger";
import { loadUserIdByToken } from "../../../../auth/RedisTokenStore";

const userIdToSockets = new Map<string, Set<WebSocket>>();

export function attachChatWs(ws: WebSocket, userId: string): void {
  let set = userIdToSockets.get(userId);
  if (!set) {
    set = new Set();
    userIdToSockets.set(userId, set);
  }
  set.add(ws);
  ws.on("close", () => {
    set!.delete(ws);
    if (set!.size === 0) userIdToSockets.delete(userId);
  });
}

export function sendToUser(userId: string, payload: object): void {
  const set = userIdToSockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

/** Coze 回调写库后推送给作者，小程序作品详情页可即时刷新疗愈结果 */
export function notifyHealingUpdate(
  userId: string,
  data: { workId: string; status: "success" | "failed" },
): void {
  sendToUser(userId, { type: "healing_update", data });
}

export function handleChatMessage(
  senderUserId: string,
  body: { type: string; data?: { userId?: string; content?: string } }
): void {
  if (body.type !== "message" || !body.data) return;
  const { userId: peerUserId, content } = body.data;
  if (!peerUserId || content === undefined) return;

  const store = getMessageStore();
  const { forPeer } = store.addMessageFromTo(senderUserId, String(peerUserId), content);
  sendToUser(String(peerUserId), {
    type: "message",
    data: { userId: senderUserId, message: forPeer },
  });
}

export function setupChatWs(ws: WebSocket, token: string | undefined): void {
  (async () => {
    if (!token) {
      ws.close(4001, "Invalid token");
      return;
    }
    const userId = await loadUserIdByToken(token);
    if (!userId) {
      ws.close(4001, "Invalid token");
      return;
    }

    attachChatWs(ws, userId);

    ws.on("message", (raw: Buffer) => {
      try {
        const body = JSON.parse(raw.toString()) as { type?: string; data?: unknown };
        if (body.type === "message") {
          handleChatMessage(userId, body as { type: string; data?: { userId?: string; content?: string } });
        }
      } catch (e) {
        gameLogger.warn("chat ws message parse error", e);
      }
    });
  })().catch((e) => {
    gameLogger.error("chat ws setup error", e);
    ws.close(1011, "Internal error");
  });
}
