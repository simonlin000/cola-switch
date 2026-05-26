# Cola Switch

`Cola Switch` 是一个给 `Cola` 用的本地 API 切换工具，现在它已经不只是“改一下配置文件”的小面板，而是一个更稳的本地切换器。

它解决的核心问题是：不去手改 `~/.cola/settings.json`，而是通过一个简单界面，把 Cola 当前使用的模型服务商、模型名、Base URL 和 API Key 切过去，同时尽量把那些容易把 Cola 切坏的兼容性问题挡在前面。

## 这次更新了什么

这轮迭代主要补的是“稳定性”和“兼容层”，不是单纯再多加几个厂商按钮：

- 新增 `接入模式 / Compatibility Profile`，把不同 API 的接法收敛成明确模板，而不是让用户手拼危险组合
- 支持 `OpenAI Compatible`、`Anthropic Messages`、`MiniMax Anthropic`、`MiMo Token Plan`、`官方模型别名` 等接入方案
- 切换前自动备份 `~/.cola/settings.json`
- 切换后立即回读验真，避免“界面提示成功，但 Cola 实际没切过去”
- 切换前会做一次真实 API 连通性检测：鉴权失败、模型不存在、Base URL 不通会直接阻止写入
- 只有输入校验和连通性检测通过后才会创建备份，避免失败操作污染备份列表
- 增加高风险组合诊断，比如 provider、模型名、Base URL、协议风格明显不匹配时主动提示
- 支持一键回滚到上一次切换前的配置

## 这个项目能做什么

- 读取并解析本机 `~/.cola/settings.json`
- 展示 Cola 当前正在使用的服务商、模型、Base URL
- 在界面里选择服务商并填写 API Key
- 一键把 Cola 切换到新的 provider / model / base URL
- 在自定义接入时选择兼容模板，而不是手拼危险组合
- 自动备份切换前的配置，并支持一键回滚
- 写入后立即回读验真，避免“看起来切了，其实没落稳”
- 对高风险的 provider / model / protocol 组合给出风险提示
- 支持常见服务商预设
- 支持 macOS 原生桌面 app 形式启动

## 当前支持的服务商

- OpenAI
- Anthropic
- OpenRouter
- Kimi
- 智谱
- Grok / xAI
- Groq
- Cerebras
- Mistral
- Hugging Face Router
- Vercel AI Gateway
- MiniMax
- 自定义接入

## 项目结构

```text
cola-switch/
├── app-src/           # macOS 原生桌面壳
├── index.html         # 前端页面
├── styles.css         # 页面样式
├── script.js          # 前端交互逻辑
├── server.js          # 本地配置读写服务
└── APP.md             # app 相关说明
```

## 本地开发

要求：

- macOS
- Node.js

启动本地页面版：

```bash
cd cola-switch
node server.js
```

浏览器打开：

```bash
http://127.0.0.1:8765
```

## 使用方式

打开后，默认只需要三步：

1. 选择服务商
2. 填 API Key
3. 点击 `保存并切换 Cola`

高级设置默认折叠，只有需要改入口、模型或自定义 Base URL 时才展开。

如果你走的是第三方网关或特殊套餐，建议先选“接入模式”：

- `原生直连`
- `OpenAI Compatible`
- `官方模型别名`
- `Anthropic Messages`
- `MiniMax Anthropic`
- `MiMo Token Plan`

这些模式会帮你把一些容易填错的底层细节收掉，比如：

- 自动规整 `/chat/completions`、`/responses`、`/messages`
- 用模板默认的 Cola provider
- 用模板默认的 Base URL
- 对明显危险的组合给出提示

## 注意事项

- 这个工具会直接修改 `~/.cola/settings.json`
- 每次切换前会自动备份一份旧配置
- 连通性检测会向所选模型服务发送一条极短的 `ping` 请求，可能产生极低额度的 API 消耗
- 请只在你明确知道自己在切换 Cola 模型配置时使用
- 自定义接入虽然有兼容模板，但不能替代 Cola runtime 本身的协议补丁
- 某些“第三方接口伪装成官方模型”的接法，如果要彻底跑通，仍然可能需要同时修改 Cola 本体路由逻辑

## 状态

当前仓库适合做两类用途：

- 自己本地切换 Cola API
- 继续演进成正式分发的 macOS 工具
