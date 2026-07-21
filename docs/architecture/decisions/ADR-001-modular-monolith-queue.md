# ADR-001: Modular monolith with DB-backed worker queue

## Status

Accepted

## Context

Limited initial compute; need scheduling and later horizontal workers; avoid premature microservices.

## Decision

Ship a modular monolith (Next.js app) plus a separate worker process sharing domain modules. Use a PostgreSQL jobs table for the queue. Add Redis/BullMQ only if measured need appears.

## Consequences

Simple ops on one VPS; fair scheduling in-app; workers can scale out later by running more worker containers against the same DB.
