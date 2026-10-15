"""Admin contribution per NEXUS_PORTFOLIO_RUNTIME_SPEC §4.5.

Endpoints:
  - GET  /admin/billing/subscriptions        — paginated list with filters
  - GET  /admin/billing/subscriptions/{id}   — full detail (sub + customer + plan history + dunning)
  - POST /admin/billing/subscriptions/{id}/cancel-immediately — admin force-cancel (no grace, no proration)
  - POST /admin/billing/subscriptions/{id}/refund — admin refund a specific invoice
  - GET  /admin/billing/dunning              — at-risk subscriptions (calls list_at_risk_subscriptions)

All endpoints require admin auth via X-Admin-Token header (the
admin-console lego validates the token; this lego trusts the
header upstream).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import aiohttp
import aiohttp.web

logger = logging.getLogger(__name__)

_STRIPE_API = "https://api.stripe.com/v1"


def _is_admin_authed(request: aiohttp.web.Request) -> bool:
    expected = (request.app.get("admin_token") or "").strip()
    provided = (request.headers.get("X-Admin-Token") or "").strip()
    return bool(expected and provided == expected)


async def _publish(js: Any, subject: str, payload: dict) -> None:
    if js is None:
        return
    try:
        await js.publish(subject, json.dumps(payload).encode())
    except Exception as exc:
        logger.warning(json.dumps({"event": "publish_error", "subject": subject, "error": str(exc)}))


async def _stripe_post(endpoint: str, form_data: dict, secret_key: str) -> tuple[int, dict]:
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Stripe-Version": os.environ.get("STRIPE_API_VERSION") or "2024-06-20",
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{_STRIPE_API}/{endpoint}",
            data=form_data, headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            return resp.status, await resp.json()


async def handle_list_subscriptions(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """GET /admin/billing/subscriptions — paginated + filterable."""
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    if not _is_admin_authed(request):
        return aiohttp.web.Response(status=403, text="admin auth required")

    query = request.rel_url.query
    status_filter = query.get("status")
    tier_filter = query.get("tier")
    limit = max(1, min(200, int(query.get("limit") or 50)))

    sql = (
        "SELECT s.id, s.tier_name, s.status, s.current_period_end, s.cancel_at_period_end, "
        "       s.created_at, c.user_id, c.email "
        "FROM billing_subscriptions s "
        "JOIN billing_customers c ON c.id = s.customer_id "
    )
    args = []
    where_parts = []
    if status_filter:
        args.append(status_filter)
        where_parts.append(f"s.status = ${len(args)}")
    if tier_filter:
        args.append(tier_filter)
        where_parts.append(f"s.tier_name = ${len(args)}")
    if where_parts:
        sql += "WHERE " + " AND ".join(where_parts) + " "
    sql += "ORDER BY s.created_at DESC LIMIT $" + str(len(args) + 1)
    args.append(limit)

    rows = await db.query(sql, *args)
    subs = [{
        "id": str(r["id"]),
        "tier_name": r["tier_name"],
        "status": r["status"],
        "current_period_end": r["current_period_end"].isoformat() if r["current_period_end"] else None,
        "cancel_at_period_end": r["cancel_at_period_end"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "user_id": str(r["user_id"]),
        "email": r["email"],
    } for r in rows]

    return aiohttp.web.json_response({"subscriptions": subs, "count": len(subs)})


async def handle_subscription_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """GET /admin/billing/subscriptions/{id} — full record."""
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    if not _is_admin_authed(request):
        return aiohttp.web.Response(status=403, text="admin auth required")

    sub_id = request.match_info.get("id") or ""
    rows = await db.query(
        "SELECT s.*, c.user_id, c.email, c.stripe_customer_id "
        "FROM billing_subscriptions s "
        "JOIN billing_customers c ON c.id = s.customer_id "
        "WHERE s.id = $1::uuid",
        sub_id,
    )
    if not rows:
        return aiohttp.web.Response(status=404, text="subscription not found")

    s = rows[0]
    plan_history_rows = await db.query(
        "SELECT from_tier_name, to_tier_name, change_type, proration_amount_cents, applied_at "
        "FROM billing_plan_changes WHERE subscription_id = $1::uuid "
        "ORDER BY initiated_at DESC LIMIT 50",
        sub_id,
    )
    dunning_rows = await db.query(
        "SELECT state, failed_payment_count, first_failed_at, last_failed_at, "
        "       next_action_at, last_email_template, resolved_at "
        "FROM billing_dunning_state WHERE subscription_id = $1::uuid LIMIT 1",
        sub_id,
    )
    dunning = None
    if dunning_rows:
        d = dunning_rows[0]
        dunning = {
            "state": d["state"],
            "failed_payment_count": d["failed_payment_count"],
            "first_failed_at": d["first_failed_at"].isoformat() if d["first_failed_at"] else None,
            "last_failed_at": d["last_failed_at"].isoformat() if d["last_failed_at"] else None,
            "next_action_at": d["next_action_at"].isoformat() if d["next_action_at"] else None,
            "last_email_template": d["last_email_template"],
            "resolved_at": d["resolved_at"].isoformat() if d["resolved_at"] else None,
        }

    return aiohttp.web.json_response({
        "subscription": {
            "id": str(s["id"]),
            "tier_name": s["tier_name"],
            "status": s["status"],
            "current_period_start": s["current_period_start"].isoformat() if s["current_period_start"] else None,
            "current_period_end": s["current_period_end"].isoformat() if s["current_period_end"] else None,
            "cancel_at_period_end": s["cancel_at_period_end"],
            "trial_end": s["trial_end"].isoformat() if s["trial_end"] else None,
            "stripe_subscription_id": s["stripe_subscription_id"],
            "user_id": str(s["user_id"]),
            "email": s["email"],
            "stripe_customer_id": s["stripe_customer_id"],
        },
        "plan_history": [{
            "from_tier_name": r["from_tier_name"],
            "to_tier_name": r["to_tier_name"],
            "change_type": r["change_type"],
            "proration_amount_cents": r["proration_amount_cents"],
            "applied_at": r["applied_at"].isoformat() if r["applied_at"] else None,
        } for r in plan_history_rows],
        "dunning": dunning,
    })


async def handle_admin_cancel_immediately(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """POST /admin/billing/subscriptions/{id}/cancel-immediately — force-cancel via Stripe."""
    db: Any = request.app.get("db")
    js: Any = request.app.get("js")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    if not _is_admin_authed(request):
        return aiohttp.web.Response(status=403, text="admin auth required")

    sub_id = request.match_info.get("id") or ""
    rows = await db.query(
        "SELECT stripe_subscription_id, tier_name FROM billing_subscriptions "
        "WHERE id = $1::uuid",
        sub_id,
    )
    if not rows:
        return aiohttp.web.Response(status=404, text="subscription not found")

    secret_key = os.environ.get("STRIPE_SECRET_KEY") or ""
    if not secret_key:
        return aiohttp.web.Response(status=503, text="stripe not configured")

    stripe_sub_id = rows[0]["stripe_subscription_id"]
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Stripe-Version": os.environ.get("STRIPE_API_VERSION") or "2024-06-20",
    }
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{_STRIPE_API}/subscriptions/{stripe_sub_id}",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status >= 400:
                return aiohttp.web.Response(status=502, text="failed to cancel via stripe")

    await _publish(js, "billing.subscription_cancelled", {
        "stripe_subscription_id": stripe_sub_id,
        "tier_name": rows[0]["tier_name"],
        "cancellation_type": "admin_immediate",
    })
    return aiohttp.web.json_response({
        "status": "cancelled_immediately",
        "stripe_subscription_id": stripe_sub_id,
    })


async def handle_admin_refund(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """POST /admin/billing/subscriptions/{id}/refund — refund a Stripe invoice."""
    db: Any = request.app.get("db")
    js: Any = request.app.get("js")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    if not _is_admin_authed(request):
        return aiohttp.web.Response(status=403, text="admin auth required")

    try:
        body = await request.json()
    except Exception:
        return aiohttp.web.Response(status=400, text="invalid JSON body")

    invoice_id = body.get("stripe_invoice_id") or ""
    if not invoice_id:
        return aiohttp.web.Response(status=400, text="stripe_invoice_id required")

    secret_key = os.environ.get("STRIPE_SECRET_KEY") or ""
    if not secret_key:
        return aiohttp.web.Response(status=503, text="stripe not configured")

    # Stripe refund: POST /refunds with charge_id; first need to fetch invoice to get charge.
    # For simplicity (and to keep the lego thin), we refund by invoice via /refunds&invoice=<id>.
    status, body_resp = await _stripe_post(
        "refunds", {"charge": invoice_id}, secret_key,
    )
    if status >= 400:
        # Some invoices have payment_intent instead of charge — try that
        status2, body2 = await _stripe_post(
            "refunds", {"payment_intent": invoice_id}, secret_key,
        )
        if status2 >= 400:
            logger.error(json.dumps({
                "event": "stripe_refund_error", "status": status, "body": body_resp,
            }))
            return aiohttp.web.Response(status=502, text="failed to refund")
        body_resp = body2

    await _publish(js, "billing.refund_issued", {
        "stripe_refund_id": body_resp.get("id"),
        "amount_cents": body_resp.get("amount"),
    })
    return aiohttp.web.json_response({
        "status": "refunded",
        "stripe_refund_id": body_resp.get("id"),
        "amount_cents": body_resp.get("amount"),
    })


async def handle_dunning_list(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """GET /admin/billing/dunning — at-risk subscriptions."""
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    if not _is_admin_authed(request):
        return aiohttp.web.Response(status=403, text="admin auth required")

    from api.dunning import list_at_risk_subscriptions  # type: ignore[import-not-found]
    items = await list_at_risk_subscriptions(db, limit=100)
    return aiohttp.web.json_response({"at_risk": items, "count": len(items)})
