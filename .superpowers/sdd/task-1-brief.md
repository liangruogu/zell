### Task 1: Install Vercel AI SDK dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Consumes: none
- Produces: npm packages `ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` available for import

- [ ] **Step 1: Add dependencies to package.json**

Read the current `app/package.json` dependencies, then add:

```json
"ai": "^4.3.0",
"@ai-sdk/openai": "^1.3.0",
"@ai-sdk/openai-compatible": "^0.2.0"
```

- [ ] **Step 2: Install packages**

```bash
cd app && pnpm install
```

- [ ] **Step 3: Verify installation**

```bash
cd app && pnpm ls ai @ai-sdk/openai @ai-sdk/openai-compatible
```

Expected: all three packages listed with versions.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/pnpm-lock.yaml
git commit -m "chore: add vercel ai sdk dependencies"
```

---


