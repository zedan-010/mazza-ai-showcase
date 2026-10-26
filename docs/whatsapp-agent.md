# WhatsApp agent

When a customer messages a business's WhatsApp number, the Mazza agent replies automatically: it answers questions, checks availability, collects booking details, creates, cancels or reschedules bookings, and pages a human when needed. Staff can watch every conversation live and take over at any moment.

[Back to overview](../README.md)

## Design

```text
Customer on WhatsApp
      |
Meta Cloud API webhook  -- verified, routed to the right business by phone number ID
      |  (responds in under 1 second)
Scheduler: 2.5 s debounce, per-conversation lock, background processing
      |
Agent loop: LLM + tools + vision  <-- business brief, knowledge, customer history
      |
Reply / draft / escalation  -->  inbox, analytics, team alerts, automations
```

### One shared webhook for every client

All businesses share one webhook endpoint. Each incoming message is routed to its organization by the WhatsApp phone number ID, so onboarding a new client needs no infrastructure change. Access tokens are validated against Meta when connected and stored encrypted (AES-256-GCM).

### Fast, safe processing

- The webhook answers Meta in **under a second** and schedules the AI work in the background.
- A **2.5 second debounce** groups rapid-fire messages so the agent answers the whole thought, not each fragment.
- An **atomic per-conversation lock** prevents two replies racing. The same field drives the "AI is typing" indicator in the inbox in real time.
- A **sweeper** in a scheduled job retries any conversation a dropped background task left unanswered.
- Autonomous replies always answer a message that just arrived, so they stay inside WhatsApp's 24-hour messaging window by construction. Approving a saved draft rechecks the window.

### The agent

- A manual **tool-calling loop** on Claude, with prompt caching.
- Tools for catalog and pricing, availability, policies, customer history, custom data tables, create, cancel and reschedule bookings, and sending photos, plus control tools to update conversation state and escalate to a human.
- **Vision:** customers can send photos and PDFs, which the agent reads (size and type capped).
- **Customer memory across channels:** the agent sees the customer's previous calls, bookings and leads.
- The same business tools power both the voice and WhatsApp agents, so both channels behave consistently.

### Guardrails: "edit the surface, not the core"

The system prompt has two layers:

1. **Core rules** (locked in code): channel behaviour, no invented data, mandatory escalation, always honest about being an AI.
2. **Surface** (editable by the business): persona, tone, greeting, knowledge entries, instructions, language, escalation keywords.

Businesses can shape how the agent sounds but can never switch off escalation, permit guessing, or hide that it is an AI.

### Human control modes

| Mode | Behaviour |
| --- | --- |
| Autonomous | AI replies are sent immediately. |
| Assisted | AI replies are saved as drafts for staff to review, edit and send. |
| Manual | AI does not run. Staff typing in a conversation switches it here instantly. |
| Resolved | Closed, nothing runs. |

AI errors and escalations **fail safe** into assisted or manual mode with a recorded reason.

### Alerts that actually reach people

When a customer asks for a human, it is a **critical** alert that bypasses mutes and reaches every opted-in team member in the app, by email and on WhatsApp. Messaging staff on WhatsApp requires a Meta-approved template, so Mazza submits a locked utility template automatically the first time alerts are enabled. Email and in-app alerts cover the minutes until Meta approves it.

### Playground

A multi-turn chat with the agent using the current (even unsaved) settings against real business data. Nothing is saved or sent; tools that would change data are simulated, and each reply shows which tools were called.

### Analytics

One database function computes the whole analytics view (conversation funnel, volume, AI vs team split, pipeline and items that need action) in a single server-side call.
