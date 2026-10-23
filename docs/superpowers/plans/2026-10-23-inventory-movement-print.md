# Inventory movement print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver original checklist item 5's printed movement output.
**Architecture:** Same filtered records feed a body-level React portal; screen remains capped at 200 rows, report is complete. Scoped print CSS hides application chrome.
**Tech Stack:** Existing React, TypeScript, CSS and Playwright; no new packages.
**Spec:** docs/superpowers/specs/2026-10-23-inventory-movement-print-design.md

## Global Constraints
No storage, App.tsx, vault merge, AI, production or deployment changes.
Preserve saved values and full notes; never infer historical units or sum unlike quantities.

## Review Focus
- More than 200 matches: complete report despite capped screen.
- Transfers: both endpoints filter correctly, signed quantity unchanged.
- Long bilingual content: full notes and references, no clipping or blank pages.
- Account change/unmount/print exception: no stale invocation or print mode left behind.
- Empty filters: explicit empty output, no stale records.

### Task 1: Movement output
Files: OperationsPage.tsx, new InventoryMovementReport.tsx, inventory-planning-batch7.css; visual fixture/runner and dedicated CI.
Interface: InventoryMovementReport consumes filtered InventoryMovementRecord[], WarehouseRecord[], workspaceId/branchId and displayed filter labels; no write callbacks.
- [ ] Write browser acceptance first; run on unchanged application and observe missing Print action.
- [ ] Implement portal, exact fields and scoped CSS; preserve screen cap and shared filter pipeline.
- [ ] Run typecheck/build, Chromium, focused stock tests and full Node suite; Chromium/WebKit CI.
- [ ] Independent final review; resolve material findings with reproducing tests.
- [ ] Commit, PR, require complete green tested head, merge and verify result.
