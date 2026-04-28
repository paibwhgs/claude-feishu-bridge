# Claude Feishu Bridge

将 Claude Code 接入飞书的桥接机器人。通过飞书 WebSocket 接收消息，调用 Claude Code CLI 处理，并将回复发送回飞书。

## 架构

```
飞书用户 → 飞书 WebSocket → EventDispatcher → claude.exe (子进程) → 回复飞书
```

- 使用飞书 `@larksuiteoapi/node-sdk` 的 WebSocket 客户端接收实时消息
- 每个飞书用户有独立的 Claude Code session，互不干扰
- 消息去重、session 持久化，重启 bot 不丢失对话记忆

## 前置条件

- Node.js 18+
- 全局安装 `@anthropic-ai/claude-code`：`npm install -g @anthropic-ai/claude-code`
- 飞书企业自建应用，拥有以下权限：
  - `im:message:read` — 读取消息
  - `im:message:send` — 发送消息
  - `contact:contact.base:readonly` — 读取用户信息（用于显示用户名）
- 飞书应用的 App ID 和 App Secret

## 配置

1. 复制配置模板：
   ```bash
   cp config.example.js config.js
   ```

2. 编辑 `config.js`，填入飞书应用的凭据：
   ```js
   export default {
     feishu: {
       appId: 'cli_xxxxxxxxxxxxxxx',
       appSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
     },
   };
   ```

## 安装和启动

```bash
# 安装依赖
npm install

# 启动
npm start
```

启动后控制台显示 `Claude Bridge 已启动，等待飞书消息...` 即可在飞书中发送消息与 Claude 对话。

## 特性

- **多用户独立会话**：每个用户通过 `feishu-{openId}` 隔离 session
- **消息串行处理**：同一用户的消息按顺序排队，不会乱序
- **消息去重持久化**：已处理的消息 ID 保存在 `.seen-messages.json`，重启后不重复处理
- **会话持久化**：Claude Code session 信息保存在 `.sessions.json`，重启后对话记忆不丢失
- **优雅退出**：Ctrl+C 时自动清理所有 Claude 子进程

## 注意事项

- `config.js` 包含敏感凭据，已加入 `.gitignore`，请勿提交到版本控制
- `.sessions.json` 和 `.seen-messages.json` 为运行时数据，已加入 `.gitignore`
- 如需查看用户显示名称，飞书应用需要 `contact:contact.base:readonly` 权限，否则会显示 openId 前缀
