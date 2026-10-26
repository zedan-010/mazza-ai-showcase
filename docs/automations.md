# Automations engine

Businesses can build workflows such as "when a booking is created, add a task, send a WhatsApp confirmation and post to our webhook", without writing code.

[Back to overview](../README.md)

## Model

```text
Trigger (call ended, booking created, lead captured, WhatsApp escalation, ...)
   |  filters
   v
Steps: condition / delay / create task / update record / move deal stage /
       add tag / email (Gmail, Outlook) / WhatsApp / HTTP webhook / app tools
```

Every run is recorded with per-step results, so the business can see exactly what happened and why.

## Failure model

Partial failure is normal when a workflow touches several outside services, so I made it explicit:

- A step that succeeds continues the run.
- A step that is skipped (provider not connected, recipient opted out) continues the run.
- A step that fails marks every step after it as **skipped because an earlier step failed**, rather than running on bad state.
- The whole run ends as `succeeded`, `partial`, `skipped_no_provider` or `failed`, so dashboards can tell "nothing was connected" apart from "something broke".

Retryable failures are parked and retried with backoff. Automation-to-automation chains have a **maximum depth**, so one workflow cannot trigger an endless loop of others.

## Security and limits

- **Incoming webhooks require an HMAC signature.** A leaked URL alone cannot trigger actions. Request bodies are size-capped, and secrets are rotated, not just disabled.
- **Integration credentials** (OAuth tokens, API keys) are stored with authenticated encryption and support key rotation.
- **Daily usage caps** per organization for messages and AI spend, enforced in the database, so a bad workflow cannot run up costs.
- **Permissions:** changing automations requires its own permission, separate from general access.

## Safe testing

A **test and simulation mode** runs a workflow against sample data and shows each step's result without sending real messages or changing records.

## Avoiding duplicate notifications

Some workflows duplicated built-in notifications (for example a "new booking" email that the platform already sends). Rather than deleting anything automatically, I added a **step-level review**: an admin confirms which steps overlap, keeps customer-facing messages separate, and saves explicitly. Workflows, history and unrelated steps are never deleted, and a changed workflow needs a fresh review.
