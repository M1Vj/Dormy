# UniDorm: Roles and Features Overview

This document provides a comprehensive overview of the user roles, the three separate finance systems, and the specific features accessible to each role within the UniDorm application.

---

## Three Separate Finance Systems

UniDorm operates **three independent financial systems**. Each has its own flow of money, expenses, and records — they must remain **completely separate** from one another.

| # | Finance System | Managed By | Description |
|---|----------------|------------|-------------|
| 1 | **Contributions** | Treasurer | Formerly "events/payable events." Renamed to **Contributions** since not all contributions are tied to an event. An optional connection to an event can be made by title (no hard logic). Each contribution has a deadline, title, and details. |
| 2 | **Maintenance Fee** | Adviser + Student Assistant | Covers dormitory upkeep and maintenance-related expenses. Separate page and ledger from contributions. |
| 3 | **Committee Finance** | Each Committee Head | Each committee manages its own finances independently. Separate from both contributions and maintenance. |

> [!IMPORTANT]
> These three finance systems each get their own dedicated page — they are NOT sub-pages of a single "Finance" page.

---

## Main Feature Areas

The core feature areas of the application are:

1. **Financing** — The 3 finance systems above (Contributions, Maintenance Fee, Committee Finance)
2. **Cleaning** — Schedules, assignments, and rotations
3. **Evaluation** — Metrics-based occupant/dorm evaluations
4. **Fines** — Reporting and approval of fines
5. **Committees** — Committee management and membership
6. **Reporting** — Financial and operational reports with charts (projector-ready)

---

## Role Hierarchy & Weights

| Weight | Role |
|--------|------|
| 100 | Admin |
| 70 | Adviser / Assistant Adviser / Student Assistant |
| 50 | Treasurer |
| 40 | Officer |
| 10 | Occupant |

---

## 1. Admin

**Summary:** System-level manager. Creates dormitories, manages occupant records, assigns adviser/SA roles, controls semesters, and views clearance status. **Has NO access to any finance system.**

**Features & Access:**

| Feature | Description |
|---------|-------------|
| **Home** | Overview of system activity and high-level metrics. |
| **Dorms** | Create dormitories. Edit each dormitory's occupant list (add, delete, edit occupants). |
| **Adviser / SA Assignment** | Add or remove Adviser and Student Assistant roles for a dormitory. |
| **Semesters** | Create, activate, and archive academic semesters. Manage semester dates. |
| **Clearance View** | View clearance status (cleared / not cleared) for each occupant and all occupants across dormitories. |
| **Settings** | Configure global system settings and defaults. |

> [!CAUTION]
> Admin must **NOT** have access to any finance page, finance data, or finance view. No contribution, maintenance, or committee finance visibility.

> [!NOTE]
> Admin does **NOT** have announcements access. Announcements are handled by Adviser/SA.

---

## 2. Adviser & Assistant Adviser

**Summary:** Handles occupant operations, maintenance finance (with SA), evaluations, role delegation, announcements, and reports. Has all occupant features plus management capabilities.

**Features & Access:**

| Feature | Description |
|---------|-------------|
| **Home** | Dashboard for dorm operations. |
| **Occupants** | View, add, manage, and update occupant records. |
| **Role Delegation** | Delegate roles to occupants — including Treasurer, Officer, and **Committee Heads**. Can delegate any role **except** Admin. |
| **Committees** | Oversee dorm committees and memberships. |
| **Maintenance Fee** | Manage the maintenance fee finance system and its expenses (jointly with SA). |
| **Cleaning** | Manage and monitor dorm cleaning schedules. |
| **Evaluation** | Start evaluations, edit evaluation metrics, and manage the full evaluation lifecycle. |
| **Events** | Oversee and approve dorm events. Manage event attendance. |
| **Fines** | View and manage fines. |
| **Reporting** | Generate and review operational and financial reports. Access reports page. |
| **Announcements** | View, create, and manage dorm announcements. |
| **Clearance** | Dedicated page to check and sign off on occupant clearance. Displays if the occupant has paid all dues and fines throughout the semester. Adviser has a separate clearance list/approval step from the SA. |
| **Treasurer Access Toggle** | In adviser settings, toggle whether the Treasurer can also access the Maintenance Fee page (view/manage). Even if toggled on, maintenance fee remains a **separate** system from contributions. |

> [!NOTE]
> All features available to Occupants are also available to Advisers.

---

## 3. Student Assistant (SA)

**Summary:** Has the **same management features as Adviser**, but is also an **Occupant simultaneously** (dual-role). The SA role and Occupant role are **switchable** via separate routing — they must NOT overlap in functionality.

**Features & Access:**

- **Same as Adviser** (all features listed in Section 2 apply).
- **Clearance Checking** — SA has a separate clearance checking page from the Adviser to review if occupants have paid all dues and fines for the semester, and to provide their specific SA signature/approval for clearance.
- **Fines Approval** — SAs have a **dedicated page and sub-page** for reviewing and approving fines reported by occupants.
- **Maintenance Fee** — Co-manages with Adviser.

**Dual-Role Behavior:**

| Aspect | Requirement |
|--------|-------------|
| **Two Roles** | SA is both a management role AND an occupant. These are separate, switchable roles. |
| **Separate Routing** | SA pages and Occupant pages use **separate routing** to avoid function overlap. |
| **SA Dashboard** | The SA dashboard/home must only show SA-relevant information. It must **NOT** display the SA's own occupant data (e.g., personal balances, personal fines). |

> [!WARNING]
> The SA dashboard must NOT leak occupant-specific data into the SA view. Keep the two roles cleanly separated.

---

## 4. Treasurer

**Summary:** An occupant with financial management powers over the **Contribution** finance system. Handles contribution collection, batch payments, receipt generation, contribution expenses, and financial reporting — all grouped by semester.

**Dual-Role:** Treasurer is also an Occupant (has all Occupant features).

### 4.1 Contributions Page

| Feature | Description |
|---------|-------------|
| **View All Contributions** | List all current contributions for the active semester. |
| **Add Contribution** | Dialog to create a new contribution with: title, details, deadline, and an **optional connection to an event** (by title only, no hard logic). |
| **Individual Contribution Sub-page** | Clicking a contribution opens a sub-page listing all occupants with: ✅ check marks for paid/unpaid, a **remaining payable** column (supports partial payments — over or under), a **change payable** button (some occupants may have differing amounts), and a **pay button**. |
| **General Pay Button** | A top-level pay button (not inside a specific contribution) opening a dialog with: multi-select contributions, occupant selection, date/time, payment type (GCash or Cash), optional receipt, default amount = total of selected contributions. If exact amount differs, treasurer chooses which contribution(s) absorb the excess or shortfall. Occupant email field (overridable). Sends **one receipt** for all selected contributions (appended). Shows **preview email** for confirmation before sending. |
| **Summary** | Display a financial summary on the contributions page and on each contribution sub-page. |

### 4.2 Receipt Sub-page (per Contribution)

| Feature | Description |
|---------|-------------|
| **Email Editor** | Editable email content for receipts. |
| **Signature** | Add a digital signature to the receipt. |
| **AI Email Generation** | Use AI to draft the receipt email content. |
| **Logo / Image** | Add an image (e.g., dorm logo) to the email. |
| **Open-Source Email Builder** | If available, use an open-source email creator/builder tool. |

### 4.3 Contribution Expenses Page

| Feature | Description |
|---------|-------------|
| **Grouped by Contribution** | Expenses are grouped and connected to a contribution (by title only). |
| **Add Grouped Expense** | Button to create a new expense group, connected to a contribution. |
| **Expense Sub-page** | Clicking a grouped expense opens a sub-page listing all items bought with full transparency details (item name, quantity, unit price, total, date, vendor/store, receipt/proof, purchased by, notes). |
| **Add Expense Item** | Button within a specific grouped expense to add individual expense items via a detailed dialog. |
| **Summary** | Financial summary on the expenses page and in each expense sub-page. |

> [!TIP]
> Research best practices for transparent expense tracking to ensure all necessary fields are included in expense dialogs (vendor, receipt proof, etc.).

### 4.4 Maintenance Fee Access (Conditional)

If the Adviser enables the toggle (see Section 2), the Treasurer can **also** view and manage the Maintenance Fee page. Even when enabled, maintenance fee remains a **completely separate** system from contributions.

### 4.5 Reporting Page

| Feature | Description |
|---------|-------------|
| **Grouped Reports** | Event → Contribution → Expense chains are grouped together with detailed breakdowns. Create sub-pages for each group. |
| **Overall Summary** | An overall financial summary across all groups. |
| **Charts & Visuals** | Include charts, graphs, and visuals relevant to financial reporting. **These reports will be projected to occupants**, so they must be presentation-ready. |

### 4.6 Semester Grouping & View Controls

| Feature | Description |
|---------|-------------|
| **Per-Semester Grouping** | All contribution data, expenses, and reports are grouped by semester. |
| **Current Semester Only** | By default, only the current/active semester is visible. Non-current semesters are hidden. |
| **Multi-Semester Selection** | On all pages (including other roles), a multi-select control allows showing other semesters. Selected semesters are **additive for viewing only** — they do NOT add data to the database. |
| **View-Only for Past Semesters** | Non-current semesters are **read-only** (cannot edit finance data) unless overridden. |
| **Excess Carryover** | Only excess amounts carry over to the next semester. A toggle exists for whether missing/deficit amounts should also pass to the next semester. |
| **Override Settings** | In Treasurer settings, an override option allows editing finance data for non-current semesters. Include all necessary controls for this override. |

### 4.7 View All Occupants (Finance Only)

The Treasurer can see all occupants, but **only finance-related information** (payment status, balances, contribution records). No access to non-financial occupant data.

---

## 5. Officer

**Summary:** Manages dormitory events and can add contribution expenses. **Cannot** add contributions or process payments.

**Features & Access:**

| Feature | Description |
|---------|-------------|
| **Home** | Committee and event overview. |
| **Events** | Manage dormitory events — add, edit, and/or delete events. Track and record **event attendance** for occupants. |
| **Contribution Expenses** | Can add contribution expenses (log what was spent). **Cannot** add new contributions and **cannot** add/process payments. |

> [!IMPORTANT]
> Officers have a limited finance scope: expenses only. No contribution creation, no payment processing.

---

## 6. Occupant

**Summary:** View-only access to dorm-level information including finance totals (no personal breakdowns), announcements, cleaning schedules, events, and their assigned committee. Can report fines.

**Features & Access:**

| Feature | Description |
|---------|-------------|
| **Home** | Personal dashboard with immediate updates. |
| **Finance Totals (View Only)** | Can see the **total** finances of their dormitory only. **Cannot** see their own individual payments, personal balance, or other occupants' financial data. |
| **Fine Reporting** | Can **report** fines (submitted for SA approval via a dedicated page and sub-page). Cannot issue or approve fines. |
| **My Committee** | View only the committee they are assigned to. Cannot see other committees. |
| **Cleaning** | View cleaning schedules (personal and dorm-wide). |
| **Events** | View upcoming dorm events and their own **event attendance** records. |
| **Announcements** | Read dorm-level and system-wide announcements. |

> [!CAUTION]
> Occupants must **NOT** see their own payment history, personal balance, or any other occupant's financial details. Only the dormitory-wide total is visible.

---

## 7. Public / Unregistered User (No Dormitory)

**Summary:** An unauthenticated user viewing the public site, or an authenticated user who is not yet assigned to any dormitory.

**Features & Access:**

| Feature | Description |
|---------|-------------|
| **Landing Page** | Public-facing marketing/information page introducing UniDorm and its features. Available to anyone (even logged out). |
| **Dormitory List** | Can see a list of available dormitories. **Cannot** see occupant lists for any dormitory. (Requires login) |
| **Apply to Dormitory** | Can apply/request to join a dormitory. Must input their details as part of the application. (Requires login) |

---

*Note: This document serves as the source of truth for role-based access control (RBAC) and feature scoping across the entire UniDorm application.*
