# AGENTS.md

## 项目简介

这是一个使用 Vue 3 + TypeScript 开发的 Web 项目。

技术栈：

* Vue 3
* TypeScript
* Vite
* Vue Router
* Pinia

---

## 项目结构

```text
src
├── assets        # 静态资源
├── components    # 公共组件
├── composables   # 可复用逻辑
├── layouts       # 页面布局
├── router        # 路由
├── services      # API 请求
├── stores        # Pinia
├── styles        # 全局样式
├── utils         # 工具函数
└── views         # 页面
```

---

## Vue 规范

优先使用：

```vue
<script setup lang="ts">
```

不要使用 Options API。

组件保持单一职责。

公共组件放到：

```
src/components
```

页面放到：

```
src/views
```

---

## TypeScript

优先使用明确类型。

避免使用：

```ts
any
```

优先：

```ts
interface
type
```

---

## 状态管理

统一使用 Pinia。

不要在组件之间直接共享状态。

全局状态放入：

```
src/stores
```

---

## 网络请求

所有接口统一放到：

```
src/services
```

不要在组件中直接写 fetch。

统一处理：

* Token
* 错误处理
* 超时
* 请求拦截

---

## 本地化

本项目使用 vue-i18n。

语言文件放在：

src/locales

至少维护：

- zh-CN.json
- en.json

所有用户可见文本必须走 i18n。

禁止在组件中硬编码用户可见文本。

新增文案时，必须同时更新所有语言文件。

i18n key 使用语义化命名，例如：

common.confirm
common.cancel
chat.input.placeholder
settings.language.title

---

## CSS

优先使用：

```vue
<style scoped>
```

公共样式放：

```
src/styles
```

避免大量内联 style。

使用现代CSS标准语法，不要主动添加CSS兼容。

---

## 组件规范

组件应保持职责单一。

建议：

* 一个组件完成一个功能
* 不超过 300 行
* 可复用逻辑提取到 composables

---

## 命名规范

组件：

```
UserCard.vue
ChatMessage.vue
```

组合函数：

```
useUser.ts
useTheme.ts
```

Store：

```
user.ts
chat.ts
settings.ts
```

---

## 修改原则

优先最小改动。

不要修改与当前任务无关的代码。

不要重复创建已有组件。

优先复用已有逻辑。

不要随意调整项目目录结构。

如果代码有迁移、兼容的行为，必须先和我确认再做。

删除或修改功能时，同步清理不再使用的代码和资源。不要留下死代码或无引用资源。

---

## 禁止修改

未经确认不要修改：

* package.json 依赖
* vite.config.ts
* 路由结构
* 全局状态设计
* 国际化配置
* 构建配置
