import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEN_FILE = path.join(__dirname, '.seen-messages.json');

function loadSeenMessages() {
  try {
    if (fs.existsSync(SEEN_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8')));
    }
  } catch {}
  return new Set();
}

function saveSeenMessages(set) {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...set]));
  } catch {}
}

export function createClients(config) {
  const client = new Client({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
  });
  return client;
}

// 用户名称缓存
const nameCache = new Map();

async function resolveUserName(client, openId) {
  if (nameCache.has(openId)) return nameCache.get(openId);
  try {
    const resp = await client.contact.v3.user.get({
      path: { user_id: openId },
      params: { user_id_type: 'open_id' },
    });
    const name = resp.data?.user?.name || resp.data?.user?.nickname || openId.slice(0, 8);
    nameCache.set(openId, name);
    return name;
  } catch {
    return openId.slice(0, 8);
  }
}

export function createBot(config, client, onMessage) {
  const seenMessages = loadSeenMessages();

  const eventDispatcher = new EventDispatcher({})
    .register({
      "im.message.receive_v1": async (data) => {
        try {
          // 去重
          const msgId = data.message.message_id;
          if (seenMessages.has(msgId)) return;
          seenMessages.add(msgId);
          saveSeenMessages(seenMessages);
          if (seenMessages.size > 500) {
            const entries = [...seenMessages];
            seenMessages.clear();
            entries.slice(-200).forEach((id) => seenMessages.add(id));
            saveSeenMessages(seenMessages);
          }

          if (data.message.message_type !== 'text') return;

          const content = JSON.parse(data.message.content);
          const text = content.text || '';
          const cleanText = text.replace(/@_user_\d+/g, '').trim();
          if (!cleanText) return;

          const chatId = data.message.chat_id;
          const openId = data.sender.sender_id.open_id;

          // 获取用户显示名称
          const userName = await resolveUserName(client, openId);

          await onMessage(openId, userName, chatId, cleanText);
        } catch (err) {
          console.error('飞书消息处理错误:', err);
        }
      },
    });

  const wsClient = new WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    onReady: () => console.log('飞书 bot WebSocket 已连接'),
    onError: (err) => console.error('飞书 WS 错误:', err.message),
  });

  return {
    start: () => wsClient.start({ eventDispatcher }),
    close: () => wsClient.close(),
  };
}

export async function sendFeishuMessage(client, chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}
