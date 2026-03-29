#  BSA Ops Hub
AI-powered workflow platform for Business Systems Analysts (BSA)

---

##  Overview

BSA Ops Hub is an intelligent platform designed to automate the end-to-end change request lifecycle — from email intake to DevOps ticket creation, tracking, and release planning.

It combines AI, enterprise integrations, and knowledge management to eliminate manual effort, improve clarity, and accelerate delivery.

---

##  Key Features

### Automated Intake (Outlook Integration)
- Seamless ingestion of change requests via Microsoft Outlook (Graph API)
- Automatically captures incoming requests from configured mailboxes
- Triggers AI-based parsing instantly upon receipt

---

###  AI Ticket Generator
- Converts incoming requests → structured Dev-ready tickets
- Generates:
  - Synopsis
  - Change Request
  - BSA Notes
  - Acceptance Criteria (Given/When/Then)
  - Test Scenarios
- One-click Azure DevOps ticket creation

---

###  Azure DevOps Integration
- Real-time sync using ADO APIs
- Fetches:
  - Work Items
  - Assigned Users
  - Sprint (Iteration Path)
  - Status (Pending / Done / Blocked)

---

###  Release Calendar (Core Feature)
- Sprint-based tracking (2-week cycles)
- Maps work items → sprints → release timeline
- Per-user visibility:
  - Pending
  - Completed
  - Carry-over
- Progress visualization + drill-down insights

Enables:
- Workload tracking per individual
- Sprint spillover detection
- Release risk visibility

---

###  Loan Context Module (Empower Integration)
- Fetches loan-level data via Empower APIs
- Provides centralized context for:
  - Loan details
  - Conditions
  - Borrower information
  - Loan status
- Enables context-aware ticket analysis and validation

---

###  Knowledge Engine (Obsidian Integration)
- Automatically captures structured outputs from AI-generated tickets
- Saves notes directly into Obsidian vault
- Organizes knowledge by:
  - Change Requests
  - Business Logic
  - Use Cases
- Builds a persistent, searchable knowledge base

Enables:
- Faster future analysis
- Reuse of past requirements
- Continuous learning loop

---

###  MCP Integration
- Modular AI tool orchestration layer
- Enables scalable automation and extensibility
- Supports future intelligent workflows across modules

---

##  Architecture

```
Electron UI
↓
Modular App Layer
↓
MCP (AI + Tool Orchestration)
↓
External Systems
  - Azure DevOps
  - Microsoft Graph (Outlook)
  - Anthropic Claude
  - Obsidian (Knowledge Vault)
  - Empower APIs
```

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Electron / JavaScript |
| Backend | Node.js |
| AI | Anthropic Claude |
| DevOps | Azure DevOps REST APIs |
| Integration | Microsoft Graph API |
| Loan System | Empower APIs |
| Knowledge | Obsidian (Markdown vault) |
| Architecture | Modular + MCP-based |

---

##  Configuration

Required integrations:
- Azure DevOps PAT
- Anthropic API Key
- Microsoft Graph (Outlook App Registration)
- Empower API access

Configured via: **Settings → Integrations**

---

##  How to Run

```bash
git clone https://github.com/meherviguturi-Ralis/bsa-ops-hub.git
cd bsa-ops-hub
npm install
npm start
```

---

##  Current Status

- AI ticket generation
- Azure DevOps integration
- Release calendar with real data
- Obsidian knowledge integration
- Outlook automation (in progress)
- Empower API integration (in progress)

---

##  Roadmap

- Full Outlook automation
- Complete Empower API integration
- Predictive release risk (AI insights)
- Auto sprint planning
- Notifications & alerts

---

##  Impact

Transforms BSA workflows from:
- Manual and fragmented

to:
- Automated and insight-driven

Enables faster delivery, better tracking, and smarter decision-making.

---

##  Author

**Meher Viguturi**
BSA | Integration | AI-driven workflow automation

---

##  Value Proposition

- Enterprise workflow automation
- AI + DevOps + Knowledge + LOS integration
- Product-level system design
- Real-world problem solving

> Not just a tool — a self-improving BSA ecosystem.
