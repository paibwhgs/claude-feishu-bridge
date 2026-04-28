import config from './config.js';
import { createClients, createBot, sendFeishuMessage } from './feishu-bot.js';
import { runClaude, killAllProcesses } from './claude-runner.js';

function validateConfig() {
  const missing = [];
  if (!config.feishu.appId) missing.push('feishu.appId');
  if (!config.feishu.appSecret) missing.push('feishu.appSecret');
  if (missing.length > 0) {
    console.error(`请在 config.js 中配置：${missing.join(', ')}`);
    process.exit(1);
  }
}

async function main() {
  validateConfig();

  const apiClient = createClients(config);

  const bot = createBot(config, apiClient, async (userId, userName, chatId, text) => {
    console.log(`[${userName}] ${text}`);

    try {
      // 带上用户身份发给 Claude，每个用户独立 session
      const reply = await runClaude(`[${userName}]: ${text}`, `feishu-${userId}`);
      console.log(`[Claude回复 ${userName}] ${reply.slice(0, 100)}...`);
      await sendFeishuMessage(apiClient, chatId, reply);
    } catch (err) {
      console.error('Claude 错误:', err);
      await sendFeishuMessage(apiClient, chatId, `处理出错：${err.message}`);
    }
  });

  await bot.start();
  console.log('Claude Bridge 已启动，等待飞书消息...');
}

main().catch(console.error);

// 优雅退出：Ctrl+C 时清理子进程
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n正在关闭...');
  killAllProcesses();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);