export type ChatMessage = {
  messageId: number;
  from: number; // 0 self, 1 peer
  content: string;
  time: number;
  read: boolean;
};

export type SessionItem = {
  userId: number | string;
  name: string;
  avatar: string;
  messages: ChatMessage[];
};

let nextMessageId = 1;
const sessionsByOwner = new Map<string, SessionItem[]>();

function ensureSessions(ownerUserId: string): SessionItem[] {
  let list = sessionsByOwner.get(ownerUserId);
  if (!list) {
    list = [
      {
        userId: 1,
        name: "Sean",
        avatar: "/static/chat/avatar-Sean.png",
        messages: [
          { messageId: 1, from: 1, content: "那明天准时见哦😊", time: 1690646400000, read: true },
          { messageId: 2, from: 0, content: "好的，我会记得的", time: 1690646400000, read: true },
          { messageId: 3, from: 1, content: "在吗？", time: Date.now() - 3600000, read: false },
          {
            messageId: 4,
            from: 1,
            content: "有个问题想咨询一下，关于TDesign组件库如何更好地使用",
            time: Date.now() - 3600000,
            read: false,
          },
        ],
      },
      {
        userId: 2,
        name: "Mollymolly",
        avatar: "/static/chat/avatar-Mollymolly.png",
        messages: [{ messageId: 5, from: 1, content: "好久不见，最近咋样？", time: 1692100800000, read: true }],
      },
      {
        userId: 3,
        name: "Andrew",
        avatar: "/static/chat/avatar-Andrew.png",
        messages: [{ messageId: 6, from: 0, content: "现在没空，晚点再联系你哈", time: 1690084800000, read: true }],
      },
      {
        userId: 4,
        name: "Kingdom",
        avatar: "/static/chat/avatar-Kingdom.png",
        messages: [{ messageId: 7, from: 1, content: "真的吗？", time: 1656880200000, read: true }],
      },
      {
        userId: 5,
        name: "Paige",
        avatar: "/static/chat/avatar-Paige.png",
        messages: [
          { messageId: 8, from: 1, content: "此次要评审的首页和专区页改版的交互方案", time: 1652963880000, read: true },
        ],
      },
    ];
    sessionsByOwner.set(ownerUserId, list);
    nextMessageId = 9;
  }
  return list;
}

export type MessageStoreAPI = {
  getUnreadCount(ownerUserId: string): number;
  getSessionList(ownerUserId: string): SessionItem[];
  markRead(ownerUserId: string, targetUserId: string): void;
  addMessage(ownerUserId: string, targetUserId: string | number, from: 0 | 1, content: string): ChatMessage;
  /** Add message from sender to peer; returns message for recipient (from=1). */
  addMessageFromTo(senderUserId: string, peerUserId: string, content: string): { forSender: ChatMessage; forPeer: ChatMessage };
  getSessionsForBroadcast(ownerUserId: string): SessionItem[];
};

function getStore(): MessageStoreAPI {
  return {
    getUnreadCount(ownerUserId: string): number {
      const list = ensureSessions(ownerUserId);
      let n = 0;
      for (const s of list) {
        n += s.messages.filter((m) => !m.read).length;
      }
      return n;
    },

    getSessionList(ownerUserId: string): SessionItem[] {
      return JSON.parse(JSON.stringify(ensureSessions(ownerUserId)));
    },

    markRead(ownerUserId: string, targetUserId: string): void {
      const list = ensureSessions(ownerUserId);
      const session = list.find((s) => String(s.userId) === String(targetUserId));
      if (session) {
        session.messages.forEach((m) => (m.read = true));
      }
    },

    addMessage(
      ownerUserId: string,
      targetUserId: string | number,
      from: 0 | 1,
      content: string
    ): ChatMessage {
      const list = ensureSessions(ownerUserId);
      let session = list.find((s) => String(s.userId) === String(targetUserId));
      if (!session) {
        session = {
          userId: targetUserId,
          name: `User ${targetUserId}`,
          avatar: "/static/chat/avatar-default.png",
          messages: [],
        };
        list.unshift(session);
      }
      const msg: ChatMessage = {
        messageId: nextMessageId++,
        from,
        content,
        time: Date.now(),
        read: from === 0,
      };
      session.messages.push(msg);
      return msg;
    },

    addMessageFromTo(senderUserId: string, peerUserId: string, content: string): { forSender: ChatMessage; forPeer: ChatMessage } {
      const forSender = this.addMessage(senderUserId, peerUserId, 0, content);
      const forPeer = this.addMessage(peerUserId, senderUserId, 1, content);
      return { forSender, forPeer };
    },

    getSessionsForBroadcast(ownerUserId: string): SessionItem[] {
      return ensureSessions(ownerUserId);
    },
  };
}

let storeInstance: MessageStoreAPI | null = null;

export function getMessageStore(): MessageStoreAPI {
  if (!storeInstance) storeInstance = getStore();
  return storeInstance;
}
