# Zell E2E 测试计划

## 运行

```bash
# 前置: 启动 Vite dev server
cd app && pnpm dev

# 日常开发 (~2min)
npx wdio run e2e-tests/wdio.conf.js --grep "@smoke"

# PR / 发版 (~4min)
npx wdio run e2e-tests/wdio.conf.js --grep "@release"
```

## 测试文件

| 文件 | 标签 | 内容 | 时间 |
|------|------|------|------|
| `smoke.spec.js` | `@smoke` | 单人全流程：创建项目 → 文章编辑格式化 → 切换验证 → 删除 → 导出 | ~1min |
| `collaborate.spec.js` | `@smoke` | 基础协作：连接服务器 → 协作编辑 → 配置同步 | ~1min |
| `release.spec.js` | `@release` | 复杂协作：服务器掉线 → 离线编辑 → 重连恢复 | ~1min |

## 设计原则

- 每个文件只有 **1 个 it()**，按场景连续执行，避免重复启动 app
- 单人操作合并到一个场景（创建项目/文章/删除不单独测）
- 回归 bug 单独加文件，标注 `@release`

