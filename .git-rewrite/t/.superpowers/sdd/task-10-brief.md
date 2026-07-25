### Task 10: Integration test 鈥?verify build and basic functionality

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Full Rust build check**

```bash
cd app/src-tauri && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 2: Frontend type check**

```bash
cd app && npx tsc --noEmit 2>&1
```

Expected: no new errors from our files.

- [ ] **Step 3: Full Tauri build (dev mode)**

```bash
cd app && pnpm tauri dev 2>&1
```

Manual verification:
1. Open a project, go to Knowledge Base
2. Press `Ctrl+Shift+K` to open AI panel
3. Ask: "杩欎釜椤圭洰鐨勮儗鏅槸浠€涔堬紵"
4. Verify: streaming response appears, tool calls show as status text
5. Ask: "甯垜鎼滅储鍏充簬 XXX 鐨勬枃绔?
6. Verify: AI uses search_knowledge tool, returns relevant results
7. Verify: existing AI settings (Provider config, test connection) still work

- [ ] **Step 4: Commit (if any fixes needed during testing)**

If fixes were needed during testing, commit them.

---


