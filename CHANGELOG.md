# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0]

### Added

- Self-service user registration via `POST /api/v1/auth/register`, with a matching sign-up screen at `/register` and the login form prefilled with the seeded demo credentials.
- Kanban board with ticket drag-and-drop between status columns, deletion by drag, and filtering by assignee, priority and label.
- Ticket management with Markdown descriptions, priorities, labels, assignees, due dates and per-project auto-numbering (`TRAKK-42`).
- Reusable ticket templates and ticket links (blocks / relates to / duplicates).
- Ticket attachments uploaded to a ticket and stored in Postgres, plus threaded comments with `@mention` autocomplete and a full activity audit trail.
- Project settings for custom status columns, labels and member management with Owner / Member / Viewer roles.
- Global search across tickets and projects, and a personal dashboard with assigned tickets and recent activity.
- Command palette (`Cmd+K` / `Ctrl+K`) for global search and quick actions.
- Real-time board and dashboard updates over SSE, without polling.
- User profiles with avatar upload, display name and theme preference, with avatars stored on local disk by default or in any S3-compatible bucket.
- Self-hostable stack runnable with a single Docker Compose file, plus a Docker-free sandbox setup script for ephemeral environments.
