# NodeBBS Agent 开发指南

本文件为在 NodeBBS 代码库上工作的 AI agent 提供背景、约定与规范。
NodeBBS 是一个基于 Turborepo 的 monorepo 现代论坛平台。

## 🏗 项目结构

本项目是由 **Turborepo** + **pnpm** 管理的 monorepo。

- **根目录**：Turbo、Docker 配置与共享脚本。
- **apps/web**：前端应用（Next.js 16、React 19、Tailwind CSS 4）。
- **apps/api**：后端 API 服务（Fastify 5、Node.js、Drizzle ORM）。

> **平台化架构**：代码分为「通用底座（core）」与「业务模块（modules）」两层，单向依赖。
> 论坛（forum）是当前唯一业务模块，是新增模块的范例。详见下方「🧩 平台化架构」。

## 🧩 平台化架构（Core + Modules）

目标：底座可复制，业务可插拔。复制底座 + 替换 `modules/<业务>` 即可生成新系统。

### 依赖方向（铁律）

```
modules/<业务>  ──►  core        （单向：模块依赖底座，底座不依赖模块）
```

底座**只在两个「组合根」**知晓模块，这是设计而非耦合：
- 后端 `apps/api/src/modules/index.js` —— 列出已启用模块的 Fastify 插件。
- 后端 `apps/api/src/db/schema.js` 末尾 —— `export *` 各模块 schema，作为 drizzle 的表组合入口。
- 前端 `apps/web/src/app/layout.js` —— 组合根布局，按需接线模块布局/Provider。

「底座」当前物理上就是 `apps/api/src/` 根（`plugins/`、`db/`、`services/`、`config/`、`utils/`、`constants/`、`extensions/`、底座 `routes/`）与 `apps/web/src/` 根（`components/`、`hooks/`、`contexts/`、`lib/`、`extensions/` 等）。**禁止**底座代码 import `modules/`（除上述组合根）。

### 路径别名（重要，覆盖默认 import 约定）

- **后端**：跨「底座/模块」边界的 import 用子路径别名（`apps/api/package.json` 的 `imports`）：
  - `#src/*` → `./src/*`（模块引用底座，如 `import db from '#src/db/index.js'`）
  - `#modules/*` → `./src/modules/*`
  - 底座内部、模块内部的同层 import 仍用相对路径 + `.js`。
- **前端**：统一 `@/*`（含 `@/modules/<业务>/...`）。

### 模块目录约定

**后端 `apps/api/src/modules/<name>/`**
```
index.js          # Fastify 插件（fp）：AutoLoad routes/，自注册 cleanup 等任务
routes/           # 被 index.js 以 { prefix: '/api' } 自动加载
services/
db/schema.js      # 模块自有表；core 的 src/db/schema.js 末尾 re-export 之
```

**前端 `apps/web/src/modules/<name>/`**
```
api.js            # 模块 API 客户端（import { apiClient } from '@/lib/api'）
ui/               # 视图/布局/全局组件（如有皮肤）
components/ hooks/ contexts/
```
> 页面文件**必须**放在 `apps/web/src/app/` 下（Next.js 文件路由要求），建议用路由组 `app/(<name>)/...`，页面只做取数 + 渲染，逻辑/视图 import 自 `@/modules/<name>`。

### 如何新增一个业务模块（以 `shop` 为例）

**后端**
1. 建 `apps/api/src/modules/shop/`，含 `index.js`、`routes/`、`services/`、`db/schema.js`。
2. `db/schema.js`：定义模块表，公共列从 `#src/db/columns.js` 引入，需引用底座表（如 `users`）从 `#src/db/schema.js` 引入。
3. `index.js`：
   ```js
   import fp from 'fastify-plugin';
   import path from 'node:path';
   import AutoLoad from '@fastify/autoload';
   import { dirname } from '#src/utils/index.js';
   const __dirname = dirname(import.meta.url);
   async function shopModule(fastify, opts) {
     // 如需定时清理：fastify.cleanup.registerTask('shop-xxx', () => ...)
     fastify.register(AutoLoad, { dir: path.join(__dirname, 'routes'), options: Object.assign({ prefix: '/api' }, opts) });
   }
   export default fp(shopModule, { name: 'shop-module', dependencies: ['db'] }); // 用到 cleanup 就加 'cleanup'
   ```
4. 注册到组合根 `apps/api/src/modules/index.js`：`import shopModule` 并加入 `modules` 数组。
5. 让 drizzle 看见模块表：在 `apps/api/src/db/schema.js` 末尾加 `export * from '../modules/shop/db/schema.js';`。
6. `pnpm db:generate` → review → `pnpm db:migrate`（或 `db:push`）。

**前端**
1. 建 `apps/web/src/modules/shop/`（`api.js` + 组件/hooks 等）。
2. 页面放 `apps/web/src/app/(shop)/...`，import 自 `@/modules/shop`。
3. 如需模块级布局/Provider，在 `apps/web/src/app/layout.js` 静态接线。

### 移除一个模块
删 `modules/<name>/` → 从 `src/modules/index.js` 移除注册 → 删 `src/db/schema.js` 的对应 `export *` → 删 `app/(<name>)/` 页面 → `db:generate` 处理表删除。

## 🛠 构建与运行命令

### 全局命令（在根目录运行）
- **安装依赖**：`pnpm install`
- **启动开发**：`pnpm dev`（同时启动 Web 与 API）
- **生产构建**：`pnpm build`
- **Lint**：当前未配置全局 lint 命令。
- **测试**：没有自动化测试套件。**不要尝试运行测试。**

### 各应用命令

**Web（`apps/web`）**：
- `pnpm dev`：启动 Next.js 开发服务器（端口 3100）。
- `pnpm build`：构建 Next.js 应用。

**API（`apps/api`）**：
- `pnpm dev`：以 watch 模式启动 Fastify 开发服务器（端口 7100）。
- `pnpm db:push`：将 Drizzle schema 变更推送到数据库。
- `pnpm db:studio`：打开 Drizzle Studio 管理数据。
- `pnpm seed`：写入初始种子数据。

## 🎨 代码风格与约定

### 通用规范
- **语言**：纯 **JavaScript**（`.js`、`.jsx`）。**不使用 TypeScript**。
- **缩进**：**2 个空格**。
- **分号**：语句结尾**始终**加分号。
- **引号**：
  - **JavaScript**：单引号（`'string'`）。
  - **JSX 属性**：双引号（`<div className="...">`）。
- **尾逗号**：多行对象、数组、函数参数中使用。

### 前端（`apps/web`）
- **框架**：Next.js 16（App Router）。
- **样式**：Tailwind CSS 4，使用工具类。
- **组件**：
  - **位置**：`src/components`（业务组件在 `src/modules/<name>/components`）。
  - **命名**：文件与导出用 PascalCase（如 `UserAvatar.jsx`）。
  - **形态**：函数组件。
- **导入**：
  - **绝对导入**：内部导入必须用 `@/` 别名。
  - **示例**：`import { Button } from '@/components/ui/button';`
  - **顺序**：外部库在前，内部组件在后。
- **UI 库**：shadcn/ui（Radix UI + Tailwind）。
  - 用 `cn()` 工具合并类名。
- **状态**：React Hooks（`useState`、`useEffect`）。
- **数据获取**：客户端组件用 `swr` 或 `fetch`；服务端组件直接 async 调用。

### 后端（`apps/api`）
- **框架**：Fastify 5。
- **模块系统**：**ES Modules（ESM）**。
- **导入**：
  - **同层相对导入**：必须用相对路径，且**必须带 `.js` 后缀**（如 `import db from '../db/index.js';`，不能写 `../db`）。这是最常见的报错来源。
  - **跨 core/module 边界**：用别名 `#src/*`、`#modules/*`（见「🧩 平台化架构 › 路径别名」）。
- **数据库**：Drizzle ORM + PostgreSQL。
  - 底座表定义在 `src/db/schema.js`；模块表在 `src/modules/<name>/db/schema.js` 并由前者末尾 re-export。
- **架构**：
  - `src/app.js`：入口。
  - `src/routes/`：底座路由（按文件夹结构）。
  - `src/services/`：底座业务逻辑。
  - `src/modules/<name>/`：业务模块（路由 + 服务 + schema 自包含）。

## 📝 命名约定

- **文件**：
  - **React 组件**：`PascalCase.jsx`
  - **Hooks**：`useCamelCase.js`
  - **工具函数**：`camelCase.js`
  - **API 路由**：文件夹内 `kebab-case` 或 `index.js`。
- **变量/函数**：`camelCase`。
- **常量**：全局常量用 `UPPER_SNAKE_CASE`。
- **环境变量**：`UPPER_SNAKE_CASE`。

## ⚠️ 错误处理

### 前端
- **用户反馈**：用 `sonner` 弹 toast 提示。
  - `toast.error('Something went wrong')`
- **逻辑**：异步操作包在 `try/catch` 中。
- **校验**：调用 API 前用 Zod（若可用）或手动校验。

### 后端
- **响应格式**：
  - 成功：`reply.send({ data: ... })` 或直接返回对象。
  - 错误：`reply.code(400).send({ error: 'Message' })`。
- **异步处理器**：始终用 `async/await` + `try/catch`。
- **插件**：标准 HTTP 错误用 `@fastify/sensible`。

## 📦 数据库与 ORM（Drizzle）

- **Schema 变更**：
  1. 修改 `apps/api` 中的 schema 文件。底座表改 `src/db/schema.js`；模块表改 `src/modules/<name>/db/schema.js`（并确保它被 `src/db/schema.js` 末尾 `export *`，否则 drizzle 看不到）。
  2. 运行 `pnpm db:generate`（如适用）或 `pnpm db:push` 同步。
  3. **除非绝对必要，绝不**手写裸 SQL。
- **查询**：使用 Drizzle 查询构建器语法。
  - `await db.select().from(users).where(eq(users.id, 1))`
- **排序字段命名**：
  - **显示顺序**：使用 `displayOrder`（integer, default 0），查询时用 `asc()` 排序（值越小越靠前）。
  - **优先级**：使用 `priority`（integer, default 0），查询时用 `desc()` 排序（值越大越靠前）。
  - 注意：已有表中存在 `position`、`order` 等历史命名，不做迁移，但**新建表必须遵循此规范**。

## 🔄 Git 与版本控制

- **提交信息**：Semantic Commit Messages。
  - `feat: add new login page`
  - `fix: resolve hydration error`
  - `chore: update dependencies`
  - `docs: update readme`
- **分支**：从 `main` 切功能分支。

## 🤖 AI Agent 行为准则

1. **实现前先核实**：创建文件前务必检查是否已存在。
2. **遵守导入约定**：
   - `apps/web`：用 `@/`（含 `@/modules/<业务>/...`）。
   - `apps/api`：同层用相对路径 + `.js`；**跨 core/module 边界用别名** `#src/*`、`#modules/*`（见「🧩 平台化架构 › 路径别名」）。相对路径错误是最常见的报错来源。
3. **不用 TypeScript**：不要加类型或 interface，需要说明用 JSDoc。
4. **不跑测试**：不要尝试 `npm test` / `pnpm test`，会失败。
5. **Tailwind**：用 Tailwind v4 语法。v4 通常不需要 `tailwind.config.js`，但要看 `postcss.config.mjs`。
6. **图标**：用 `lucide-react`。

## 🔍 诊断

由于没有严格的类型检查（TS）或 lint 命令：
1. **阅读文件**：仔细读相关文件，理解预期的对象结构。
2. **Console 日志**：开发时可用 `console.log` 调试，但完成前移除。
3. **运行时验证**：通过观察 dev server 是否崩溃/报错来验证改动。

## 🚀 部署背景

- **Docker**：应用已容器化，每个 app 都有 `Dockerfile`。
- **环境变量**：用 `dotenvx` 管理密钥。
- **PM2**：生产环境用于进程管理。

---
*由 AI Agent 为 AI Agent 编写。*
