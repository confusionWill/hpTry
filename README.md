# hpTry——服务于一个新的PPT格式

hpTry 是一个运行在浏览器中的 AI 演示文稿工作区。你可以通过对话让Agent创建、修改和调试基于 HTML 的幻灯片，并在同一界面中实时查看结果、管理项目文件，以及导入或导出 `.hp` 项目。

项目数据保存在浏览器本地，不依赖业务后端。

## 功能特性

- 实时预览生成的演示文稿，支持幻灯片列表、画布比例切换和全屏查看
- Web-Agent 可读取、搜索、新建、编辑、重命名和删除工作区文件
- 管理多个项目和会话，保留消息及工具调用记录
- 支持 OpenAI Chat Completions 风格的模型接口和流式响应
- 内置 DeepSeek 供应商配置，也可添加自定义接口地址与模型
- 支持 `.hp` 项目的导入与导出
- 项目、会话、供应商和工作区文件通过 IndexedDB 保存在本地

## `.hp` 项目格式

`.hp` 文件本质上是 ZIP 压缩包，内部保存演示项目的文本文件和二进制资源。导出时不会包含 `.tmp/` 下的临时上传文件。

一个基础演示项目通常包含：

```text
manifest.json
hp.html
main.js
runtime/
├── runtime.css
└── vue.esm-browser.prod.js
slides/
└── slide-001.js
styles/
└── style.css
```

- `hp.html` 是预览入口。
- `manifest.json` 定义画布尺寸、键盘导航和幻灯片顺序。
- `slides/slide-xxx.js` 默认导出一个 Vue 组件，每个文件对应一页幻灯片。
- `assets/` 可用于存放图片、字体、音视频等静态资源。
- `styles/` 和 `scripts/` 可用于存放跨页面复用的样式与脚本。


## 快速开始

### 环境要求

- Node.js（建议使用当前 LTS 版本）
- npm
- 支持 IndexedDB、Service Worker 和 ES Module 的现代浏览器

### 安装与运行

```bash
npm ci
cp .env.example .env
npm run dev
```

启动后访问：

- 主应用：<http://127.0.0.1:5111>
- 预览服务：<http://127.0.0.1:5112>

`npm run dev` 会同时启动主应用和预览服务。实时预览依赖两个服务，请勿只启动其中一个。

### 配置模型

1. 打开主应用。
2. 进入供应商设置。
3. 填写接口地址、API Key 和模型名称。
4. 点击“测试连接”，通过后保存配置。
5. 创建项目和会话，在输入框中描述需要生成或修改的演示内容。

> API Key 会存储在当前浏览器的 IndexedDB 中。请只在可信设备和可信部署环境中使用，不要在公共或共享设备上保存生产密钥。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_PREVIEW_ORIGIN` | `http://127.0.0.1:5112` | 独立预览服务的源地址 |

如果修改了预览服务的域名、协议或端口，需要同步更新该变量。主应用与预览服务通过受来源校验的 `postMessage` 通道交换工作区资源。

## 可用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动主应用和预览服务的开发服务器 |
| `npm run build` | 执行类型检查，并分别构建主应用与预览服务 |
| `npm run preview` | 本地预览两个构建产物 |

构建产物分别输出到 `dist/` 和 `dist-preview/`。部署时需要分别托管两者，并将 `VITE_PREVIEW_ORIGIN` 指向预览站点的公开源地址。

## License

[MIT](./LICENSE) © 2026 confusionWill
