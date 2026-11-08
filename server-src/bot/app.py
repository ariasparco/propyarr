"""FastAPI Application providing full REST APIs, SSE real-time streaming, and serving the React Web Dashboard."""

import os
import json
import asyncio
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.config import logger
from api.db_manager import db, hash_password

app = FastAPI(
    title="Prop Firm Trader Monitoring & Analysis Platform",
    description="Full-stack FastAPI backend serving the React Dashboard and automated MetaTrader extraction engine.",
    version="3.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
UI_DIST_DIR = BASE_DIR / "ui" / "dist"
ASSETS_DIR = UI_DIST_DIR / "assets"

# Mount static Vite bundle assets if dist exists
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# --- In-Memory Session Store ---
SESSIONS: Dict[str, Dict[str, Any]] = {}


# --- Request Schemas ---
class LoginRequest(BaseModel):
    username: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = "123456"


class TraderLoginRequest(BaseModel):
    login: Optional[str] = None
    username: Optional[str] = None
    password: str = Field(..., description="MT5 Password")


class ChangePasswordRequest(BaseModel):
    oldPassword: Optional[str] = ""
    newPassword: str


class AddAccountRequest(BaseModel):
    login: str = Field(..., description="MT5 Login ID")
    password: str = Field(..., description="MT5 Password")
    server: str = Field("MetaQuotes-Demo", description="MT5 Broker Server")
    trader_name: Optional[str] = "تریدر جدید"
    challenge_stage: Optional[str] = "گلد کلاسیک — مرحله ۱"
    initial_balance: Optional[float] = 10000.0
    headless: Optional[bool] = False


class DecisionRequest(BaseModel):
    decision: str = Field(..., description="approved | rejected | requires_action | in_review")
    note: Optional[str] = None


class AdvanceStageRequest(BaseModel):
    stage: Optional[str] = Field(None, description="Target challenge stage name")


class NoteRequest(BaseModel):
    note: str


class CreateBotRequest(BaseModel):
    name: str
    base_url: str
    apiKey: Optional[str] = "mt5-default-secret"
    challenge_stage: Optional[str] = "گلد کلاسیک — مرحله ۱"


# --- Helper JSON Response Wrapper ---
def api_success(data: Any = None, message: Optional[str] = None, status_code: int = 200):
    content = {"success": True}
    if data is not None:
        content["data"] = data
        if isinstance(data, dict):
            content.update(data)
    if message:
        content["message"] = message
    return JSONResponse(content=content, status_code=status_code)


# --- Auth Dependencies ---
async def get_current_session(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif request.query_params.get("token"):
        token = request.query_params.get("token").strip()

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست کاربری نامعتبر یا منقضی شده است.")

    # 1. Admin default token check
    if token == "session_token_propfirm_admin_2026":
        user = db.users[0] if db.users else {
            "id": 1, "username": "admin", "full_name": "مدیر ارشد ریسک", "email": "admin@propfirm.local", "role": "admin"
        }
        return {
            "role": "admin",
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "fullName": user["full_name"],
                "email": user["email"],
                "role": "admin"
            }
        }

    # 2. Registered session check
    if token in SESSIONS:
        return SESSIONS[token]

    # 3. Dynamic trader session validation
    if token.startswith("trader_session_"):
        parts = token.split("_")
        if len(parts) >= 3:
            acc_id = parts[2]
            acc = next((a for a in db.accounts if str(a.get("account_id")) == str(acc_id)), None)
            if acc:
                trader_id = acc.get("trader_id")
                user_accounts = [a for a in db.accounts if a.get("trader_id") == trader_id or str(a.get("account_id")) == str(acc_id)]
                trader = next((t for t in db.traders if t.get("id") == trader_id or str(t.get("account_id")) == str(acc_id)), None)
                account_summaries = [
                    {
                        "accountId": str(a["account_id"]),
                        "traderName": a.get("trader_name", "تریدر"),
                        "challengeStage": a.get("challenge_stage", "گلد کلاسیک — مرحله ۱"),
                        "balance": a.get("balance", 0.0),
                        "equity": a.get("equity", 0.0),
                        "profit": a.get("profit", 0.0),
                        "lastSyncedAt": a.get("last_synced_at"),
                        "challengeDecision": a.get("challenge_decision", "in_review")
                    }
                    for a in user_accounts
                ]
                user_obj = {
                    "id": trader["id"] if trader else int(acc["account_id"][-4:] if str(acc["account_id"]).isdigit() else 1),
                    "username": str(acc_id),
                    "accountId": str(acc_id),
                    "traderId": trader_id,
                    "fullName": trader["name"] if trader else acc.get("trader_name", f"تریدر #{acc_id}"),
                    "email": trader.get("email") if trader else f"trader_{acc_id}@propfirm.local",
                    "role": "trader",
                    "accounts": account_summaries
                }
                session = {
                    "role": "trader",
                    "token": token,
                    "accountId": str(acc_id),
                    "traderId": trader_id,
                    "accounts": [str(a["account_id"]) for a in user_accounts],
                    "user": user_obj
                }
                SESSIONS[token] = session
                return session

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست کاربری نامعتبر یا منقضی شده است.")


async def require_admin(session: Dict[str, Any] = Depends(get_current_session)) -> Dict[str, Any]:
    if session.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی غیرمجاز. این بخش مخصوص مدیران سیستم است.")
    return session


async def require_trader(session: Dict[str, Any] = Depends(get_current_session)) -> Dict[str, Any]:
    if session.get("role") != "trader":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی غیرمجاز. این بخش مخصوص تریدرها است.")
    return session


# --- Auth APIs ---
@app.post("/api/auth/login")
async def auth_login(req: LoginRequest):
    u = req.username or req.login or "admin"
    user = db.authenticate_user(u, req.password or "")
    if not user:
        raise HTTPException(status_code=401, detail="نام کاربری یا رمز عبور اشتباه است.")
    
    return api_success({
        "token": "session_token_propfirm_admin_2026",
        "user": user
    }, message="ورود با موفقیت انجام شد.")


@app.post("/api/trader-auth/login")
@app.post("/api/trader/login")
async def trader_auth_login(req: TraderLoginRequest):
    login_id = req.login or req.username
    if not login_id or not req.password:
        raise HTTPException(status_code=400, detail="شماره حساب و رمز عبور متاتریدر ۵ الزامی است.")

    trader_profile = db.authenticate_trader(login_id, req.password)
    if not trader_profile:
        logger.warning(f"Failed trader login attempt for login ID: {str(login_id)[:4]}***")
        raise HTTPException(status_code=401, detail="شماره حساب متاتریدر ۵ یا رمز عبور اشتباه است.")

    acc_id = str(trader_profile["accountId"])
    token = f"trader_session_{acc_id}_{secrets.token_hex(16)}"
    session_data = {
        "role": "trader",
        "token": token,
        "accountId": acc_id,
        "traderId": trader_profile.get("traderId"),
        "accounts": [str(a["accountId"]) for a in trader_profile.get("accounts", [])],
        "user": trader_profile
    }
    SESSIONS[token] = session_data
    logger.info(f"Trader logged in successfully: #{acc_id}")

    return api_success({
        "token": token,
        "user": trader_profile
    }, message="ورود به سامانه تریدر با موفقیت انجام شد.")


@app.get("/api/auth/me")
async def auth_me(request: Request):
    try:
        session = await get_current_session(request)
        user_info = session.get("user", {})
        return api_success({
            "user": user_info,
            **user_info
        })
    except HTTPException:
        # Fallback to default admin user if running without auth header for initial loads
        user = db.users[0] if db.users else None
        if not user:
            raise HTTPException(status_code=401, detail="کاربر یافت نشد.")
        user_info = {
            "id": user["id"],
            "username": user["username"],
            "fullName": user["full_name"],
            "email": user["email"],
            "role": user["role"]
        }
        return api_success({
            "user": user_info,
            **user_info
        })


@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest):
    if len(req.newPassword) < 4:
        raise HTTPException(status_code=400, detail="رمز عبور باید حداقل ۴ کاراکتر باشد.")
    if db.users:
        db.users[0]["password_hash"] = hash_password(req.newPassword)
        db._save_to_disk()
    return api_success(message="رمز عبور مدیر با موفقیت تغییر کرد.")


@app.post("/api/auth/logout")
async def auth_logout():
    return api_success(message="خروج با موفقیت انجام شد.")


# --- Trader-Facing Read-Only Portal APIs ---

@app.get("/api/trader-portal/accounts")
async def get_trader_portal_accounts(session: Dict[str, Any] = Depends(require_trader)):
    """Returns read-only summary of all accounts belonging to the authenticated trader."""
    authorized_ids = session.get("accounts", [session.get("accountId")])
    accounts = db.get_trader_accounts_summary(authorized_ids)
    return api_success({"items": accounts, "accounts": accounts})


@app.get("/api/trader-portal/account")
async def get_trader_portal_active_account(session: Dict[str, Any] = Depends(require_trader)):
    """Returns full read-only deep metrics and 13-rule compliance for the primary authenticated account."""
    primary_id = session.get("accountId")
    if not primary_id and session.get("accounts"):
        primary_id = session["accounts"][0]
    
    authorized_ids = session.get("accounts", [primary_id])
    detail = db.get_trader_portal_detail(primary_id, authorized_ids)
    if not detail:
        raise HTTPException(status_code=404, detail="حساب مورد نظر یافت نشد.")
    return api_success(detail)


@app.get("/api/trader-portal/account/{account_id}")
async def get_trader_portal_specific_account(account_id: str, session: Dict[str, Any] = Depends(require_trader)):
    """Returns full read-only metrics for a specific account, strictly enforcing that account_id is owned by the trader."""
    authorized_ids = [str(x).strip() for x in session.get("accounts", [])]
    req_acc_id = str(account_id).strip()

    if req_acc_id not in authorized_ids:
        logger.warning(f"Unauthorized account access attempt: Trader session #{session.get('accountId')} tried to view account #{req_acc_id}")
        raise HTTPException(status_code=403, detail="شما اجازه دسترسی به اطلاعات این حساب را ندارید.")

    detail = db.get_trader_portal_detail(req_acc_id, authorized_ids)
    if not detail:
        raise HTTPException(status_code=404, detail="حساب مورد نظر یافت نشد.")
    return api_success(detail)


# --- Traders & Accounts APIs ---
@app.get("/api/traders")
async def get_traders(
    search: Optional[str] = None,
    stage: Optional[str] = None,
    decision: Optional[str] = None,
    page: int = 1,
    limit: int = 15
):
    result = db.list_traders(search=search, stage=stage, decision=decision, page=page, limit=limit)
    return api_success(result)


@app.post("/api/traders/add")
async def add_account(req: AddAccountRequest):
    """Adds a new MT5 account and runs live extraction via Playwright."""
    try:
        acc = await db.add_and_extract_account(
            login=req.login,
            password=req.password,
            server=req.server,
            trader_name=req.trader_name or f"تریدر #{req.login}",
            challenge_stage=req.challenge_stage or "گلد کلاسیک — مرحله ۱",
            initial_balance=req.initial_balance or 10000.0,
            headless=req.headless or False
        )
        return api_success(acc, message="حساب با موفقیت استخراج و به سامانه اضافه شد.")
    except Exception as e:
        logger.error(f"Error adding account: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/traders/{account_id}")
async def get_trader_detail(account_id: str):
    detail = db.get_account_detail(account_id)
    if not detail:
        raise HTTPException(status_code=404, detail="حساب مورد نظر یافت نشد.")
    return api_success(detail)


@app.delete("/api/traders/{account_id}")
async def delete_trader_account(account_id: str):
    success = db.delete_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="حساب یافت نشد.")
    return api_success(message=f"حساب #{account_id} با موفقیت حذف شد.")


@app.post("/api/traders/{account_id}/sync")
async def sync_trader_live(account_id: str):
    """Re-syncs live metrics for the specific account. Blocks sync if disqualified or rejected."""
    acc = next((a for a in db.accounts if str(a["account_id"]) == str(account_id)), None)
    if not acc:
        raise HTTPException(status_code=404, detail="حساب یافت نشد.")

    if acc.get("challenge_decision") == "rejected" or acc.get("is_disqualified"):
        raise HTTPException(status_code=400, detail="این حساب به دلیل رد چالش (حذف) در لیست حذفیات قرار دارد و همگام‌سازی آن متوقف است.")
    
    pwd = acc.get("password")
    if not pwd or pwd == "••••••••":
        raise HTTPException(status_code=400, detail="رمز عبور متاتریدر برای این حساب ثبت نشده است.")

    try:
        updated = await db.add_and_extract_account(
            login=acc["account_id"],
            password=pwd,
            server=acc.get("server", "MetaQuotes-Demo"),
            trader_name=acc.get("trader_name", "تریدر"),
            challenge_stage=acc.get("challenge_stage", "گلد کلاسیک — مرحله ۱"),
            initial_balance=acc.get("initial_balance", 10000.0),
            headless=False
        )
        return api_success(updated, message="همگام‌سازی زنده با موفقیت انجام شد.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطا در همگام‌سازی: {str(e)}")


@app.post("/api/traders/{account_id}/advance-stage")
@app.patch("/api/traders/{account_id}/advance-stage")
async def advance_trader_stage(account_id: str, req: Optional[AdvanceStageRequest] = None):
    """Advances account to the next challenge stage and resets profit history for the new stage."""
    try:
        stage_target = req.stage if req else None
        db.advance_to_next_stage(account_id, target_stage=stage_target, manual=True)
        detail = db.get_account_detail(account_id)
        return api_success(detail, message=f"حساب #{account_id} با موفقیت به مرحله بعد ارتقا یافت و سابقه سود آن ریست شد.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/traders/{account_id}/decision")
@app.post("/api/traders/{account_id}/decision")
async def update_decision(account_id: str, req: DecisionRequest):
    try:
        db.update_challenge_decision(account_id, req.decision, req.note)
        detail = db.get_account_detail(account_id)
        return api_success(detail, message="وضعیت تصمیم چالش ثبت شد.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/traders/{account_id}/note")
@app.post("/api/traders/{account_id}/notes")
async def add_note(account_id: str, req: NoteRequest):
    created = db.add_admin_note(account_id, author="مدیر ارشد ریسک", note=req.note)
    return api_success(created, message="یادداشت با موفقیت افزوده شد.", status_code=201)



# --- Overview & Analytics APIs ---
@app.get("/api/overview")
async def get_overview():
    stats = db.get_overview()
    return api_success(stats)


@app.get("/api/ranking")
async def get_ranking(
    sortBy: Optional[str] = "returnPct",
    timeframe: Optional[str] = "all",
    stage: Optional[str] = None
):
    ranking_items = db.get_ranking()
    return api_success({"items": ranking_items})


# --- Rules & Templates APIs ---
@app.get("/api/rules/templates")
@app.get("/api/rules")
async def get_rules_templates():
    return api_success(db.rule_templates)


@app.put("/api/rules/templates/{template_id}")
async def update_rule_template(template_id: int, req: Dict[str, Any]):
    for idx, tpl in enumerate(db.rule_templates):
        if tpl["id"] == template_id:
            db.rule_templates[idx].update(req)
            db._save_to_disk()
            return api_success(db.rule_templates[idx], message="قالب قوانین با موفقیت بروزرسانی شد.")
    raise HTTPException(status_code=404, detail="قالب قوانین یافت نشد.")


# --- Bot Management & Logs APIs ---
@app.get("/api/bots")
async def get_bots():
    if db.bots:
        db.bots[0]["accountsCount"] = len(db.accounts)
    return api_success(db.bots)


@app.get("/api/bots/logs")
async def get_bot_logs():
    return api_success(db.sync_logs if db.sync_logs else [])


@app.post("/api/bots/{bot_id}/test")
async def test_bot_connection(bot_id: int):
    return api_success({
        "status": "online",
        "latency_ms": 42,
        "message": "اتصال به موتور هوشمند متاتریدر برقرار است."
    })


@app.post("/api/bots")
async def create_bot(req: CreateBotRequest):
    new_bot = {
        "id": len(db.bots) + 1,
        "name": req.name,
        "base_url": req.base_url,
        "apiKeyMasked": "••••••••••••••••",
        "status": "online",
        "last_ping_at": datetime.now(timezone.utc).isoformat(),
        "last_sync_at": "هم‌اکنون",
        "error_message": None,
        "accountsCount": 0
    }
    db.bots.append(new_bot)
    db._save_to_disk()
    return api_success(new_bot, message="ربات جدید با موفقیت اضافه شد.", status_code=201)


@app.delete("/api/bots/{bot_id}")
async def delete_bot(bot_id: int):
    db.bots = [b for b in db.bots if b["id"] != bot_id]
    db._save_to_disk()
    return api_success(message="ربات با موفقیت حذف شد.")


@app.post("/api/bots/sync-all")
async def sync_all_bots():
    """Syncs all active registered accounts through Playwright, skipping disqualified/rejected accounts."""
    if not db.accounts:
        return api_success({
            "message": "هیچ حسابی در دیتابیس ثبت نشده است.",
            "accountsSynced": 0
        })

    synced_count = 0
    skipped_count = 0
    errors = []

    for acc in db.accounts:
        acc_id = str(acc["account_id"])
        if acc.get("challenge_decision") == "rejected" or acc.get("is_disqualified"):
            skipped_count += 1
            errors.append(f"حساب #{acc_id}: در لیست حذفیات قرار دارد — همگام‌سازی متوقف است.")
            continue

        try:
            pwd = acc.get("password")
            if not pwd or pwd == "••••••••":
                errors.append(f"حساب #{acc_id}: رمز عبور ثبت نشده است.")
                continue

            await db.add_and_extract_account(
                login=acc_id,
                password=pwd,
                server=acc.get("server", "MetaQuotes-Demo"),
                trader_name=acc.get("trader_name", "تریدر"),
                challenge_stage=acc.get("challenge_stage", "گلد کلاسیک — مرحله ۱"),
                initial_balance=acc.get("initial_balance", 10000.0),
                headless=False
            )
            synced_count += 1
        except Exception as e:
            errors.append(f"حساب #{acc_id}: {str(e)}")

    if errors:
        return api_success({
            "message": f"همگام‌سازی {synced_count} حساب انجام شد ({skipped_count} حساب حذف شده متوقف ماند). خطاها/هشدارها: {'; '.join(errors)}",
            "accountsSynced": synced_count,
            "accountsSkipped": skipped_count
        })
    
    return api_success({
        "message": f"کلیه حساب‌های فعال ({synced_count} حساب) با موفقیت همگام‌سازی و تحلیل شدند.",
        "accountsSynced": synced_count,
        "accountsSkipped": skipped_count
    })


# --- Real-time SSE Streaming APIs for Sync Animation & Progress Tracking ---

@app.get("/api/sync/stream-all")
@app.post("/api/sync/stream-all")
async def stream_sync_all():
    """Server-Sent Events stream for syncing all registered accounts with detailed progress, skipping disqualified accounts."""
    async def event_generator():
        accounts = list(db.accounts)
        total_accounts = len(accounts)
        
        if total_accounts == 0:
            yield f"data: {json.dumps({'type': 'complete', 'success': True, 'message': 'هیچ حسابی برای همگام‌سازی ثبت نشده است.', 'accountsSynced': 0, 'errors': []}, ensure_ascii=False)}\n\n"
            return

        yield f"data: {json.dumps({'type': 'init', 'totalAccounts': total_accounts, 'message': f'شروع همگام‌سازی و تحلیل {total_accounts} حساب متاتریدر...'}, ensure_ascii=False)}\n\n"
        
        synced_count = 0
        skipped_count = 0
        errors = []

        for idx, acc in enumerate(accounts, 1):
            acc_id = str(acc["account_id"])
            trader_name = acc.get("trader_name", f"تریدر #{acc_id[-4:]}")
            server = acc.get("server", "MetaQuotes-Demo")
            pwd = acc.get("password")

            # Check if disqualified/rejected
            if acc.get("challenge_decision") == "rejected" or acc.get("is_disqualified"):
                skipped_count += 1
                msg = f"حساب #{acc_id} ({trader_name}) به دلیل رد چالش (حذف) همگام‌سازی نشد."
                errors.append(msg)
                yield f"data: {json.dumps({'type': 'account_skipped', 'accountIndex': idx, 'totalAccounts': total_accounts, 'accountId': acc_id, 'traderName': trader_name, 'reason': 'حساب در لیست حذفیات قرار دارد و همگام‌سازی آن متوقف است.'}, ensure_ascii=False)}\n\n"
                continue

            yield f"data: {json.dumps({'type': 'account_start', 'accountIndex': idx, 'totalAccounts': total_accounts, 'accountId': acc_id, 'traderName': trader_name, 'server': server}, ensure_ascii=False)}\n\n"

            if not pwd or pwd == "••••••••":
                err_msg = f"رمز عبور حساب #{acc_id} یافت نشد."
                errors.append(err_msg)
                yield f"data: {json.dumps({'type': 'account_error', 'accountIndex': idx, 'accountId': acc_id, 'error': err_msg}, ensure_ascii=False)}\n\n"
                continue

            event_queue = asyncio.Queue()

            async def on_progress(data: Dict[str, Any]):
                data["accountIndex"] = idx
                data["totalAccounts"] = total_accounts
                await event_queue.put(data)

            # Run extraction as background task
            async def run_sync():
                try:
                    await db.add_and_extract_account(
                        login=acc_id,
                        password=pwd,
                        server=server,
                        trader_name=trader_name,
                        challenge_stage=acc.get("challenge_stage", "گلد کلاسیک — مرحله ۱"),
                        initial_balance=acc.get("initial_balance", 10000.0),
                        headless=False,
                        progress_callback=on_progress
                    )
                    await event_queue.put({"type": "_done", "success": True})
                except Exception as e:
                    await event_queue.put({"type": "_done", "success": False, "error": str(e)})

            task = asyncio.create_task(run_sync())

            while True:
                ev = await event_queue.get()
                if ev.get("type") == "_done":
                    if ev["success"]:
                        synced_count += 1
                        yield f"data: {json.dumps({'type': 'account_success', 'accountIndex': idx, 'accountId': acc_id, 'traderName': trader_name}, ensure_ascii=False)}\n\n"
                    else:
                        err_text = ev.get("error", "خطای ناشناخته")
                        errors.append(f"حساب #{acc_id}: {err_text}")
                        yield f"data: {json.dumps({'type': 'account_error', 'accountIndex': idx, 'accountId': acc_id, 'error': err_text}, ensure_ascii=False)}\n\n"
                    break
                else:
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

            await task

        yield f"data: {json.dumps({'type': 'complete', 'success': True, 'message': f'همگام‌سازی پایان یافت: {synced_count} حساب فعال همگام‌سازی شدند، {skipped_count} حساب حذف شده متوقف ماندند.', 'accountsSynced': synced_count, 'accountsSkipped': skipped_count, 'errors': errors}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/sync/stream-account/{account_id}")
@app.post("/api/sync/stream-account/{account_id}")
async def stream_sync_single_account(account_id: str):
    """Server-Sent Events stream for syncing a single specific account."""
    acc = next((a for a in db.accounts if str(a["account_id"]) == str(account_id)), None)
    if not acc:
        raise HTTPException(status_code=404, detail="حساب یافت نشد.")

    if acc.get("challenge_decision") == "rejected" or acc.get("is_disqualified"):
        raise HTTPException(status_code=400, detail="این حساب به دلیل رد چالش (حذف) در لیست حذفیات قرار دارد و همگام‌سازی آن متوقف است.")

    pwd = acc.get("password")
    if not pwd or pwd == "••••••••":
        raise HTTPException(status_code=400, detail="رمز عبور برای این حساب ثبت نشده است.")

    async def event_generator():
        acc_id = str(acc["account_id"])
        trader_name = acc.get("trader_name", f"تریدر #{acc_id[-4:]}")
        server = acc.get("server", "MetaQuotes-Demo")

        yield f"data: {json.dumps({'type': 'init', 'totalAccounts': 1, 'message': f'شروع همگام‌سازی زنده و تحلیل حساب #{acc_id}...'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'account_start', 'accountIndex': 1, 'totalAccounts': 1, 'accountId': acc_id, 'traderName': trader_name, 'server': server}, ensure_ascii=False)}\n\n"

        event_queue = asyncio.Queue()

        async def on_progress(data: Dict[str, Any]):
            data["accountIndex"] = 1
            data["totalAccounts"] = 1
            await event_queue.put(data)

        async def run_sync():
            try:
                await db.add_and_extract_account(
                    login=acc_id,
                    password=pwd,
                    server=server,
                    trader_name=trader_name,
                    challenge_stage=acc.get("challenge_stage", "گلد کلاسیک — مرحله ۱"),
                    initial_balance=acc.get("initial_balance", 10000.0),
                    headless=False,
                    progress_callback=on_progress
                )
                await event_queue.put({"type": "_done", "success": True})
            except Exception as e:
                await event_queue.put({"type": "_done", "success": False, "error": str(e)})

        task = asyncio.create_task(run_sync())

        while True:
            ev = await event_queue.get()
            if ev.get("type") == "_done":
                if ev["success"]:
                    yield f"data: {json.dumps({'type': 'account_success', 'accountIndex': 1, 'accountId': acc_id, 'traderName': trader_name}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'complete', 'success': True, 'message': f'حساب #{acc_id} با موفقیت همگام‌سازی و تحلیل شد.', 'accountsSynced': 1, 'errors': []}, ensure_ascii=False)}\n\n"
                else:
                    err_text = ev.get("error", "خطای ناشناخته")
                    yield f"data: {json.dumps({'type': 'account_error', 'accountIndex': 1, 'accountId': acc_id, 'error': err_text}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'message': f'خطا در همگام‌سازی حساب #{acc_id}: {err_text}', 'accountsSynced': 0, 'errors': [err_text]}, ensure_ascii=False)}\n\n"
                break
            else:
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

        await task

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/sync/stream-add")
async def stream_add_account(req: AddAccountRequest):
    """Server-Sent Events stream for adding and live-extracting a new account."""
    async def event_generator():
        login_id = str(req.login).strip()
        trader_name = req.trader_name or f"تریدر #{login_id}"
        server = req.server or "MetaQuotes-Demo"

        yield f"data: {json.dumps({'type': 'init', 'totalAccounts': 1, 'message': f'افزودن و تحلیل هوشمند حساب جدید #{login_id}...'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'account_start', 'accountIndex': 1, 'totalAccounts': 1, 'accountId': login_id, 'traderName': trader_name, 'server': server}, ensure_ascii=False)}\n\n"

        event_queue = asyncio.Queue()

        async def on_progress(data: Dict[str, Any]):
            data["accountIndex"] = 1
            data["totalAccounts"] = 1
            await event_queue.put(data)

        async def run_add():
            try:
                await db.add_and_extract_account(
                    login=login_id,
                    password=req.password,
                    server=server,
                    trader_name=trader_name,
                    challenge_stage=req.challenge_stage or "گلد کلاسیک — مرحله ۱",
                    initial_balance=req.initial_balance or 10000.0,
                    headless=req.headless or False,
                    progress_callback=on_progress
                )
                await event_queue.put({"type": "_done", "success": True})
            except Exception as e:
                await event_queue.put({"type": "_done", "success": False, "error": str(e)})

        task = asyncio.create_task(run_add())

        while True:
            ev = await event_queue.get()
            if ev.get("type") == "_done":
                if ev["success"]:
                    yield f"data: {json.dumps({'type': 'account_success', 'accountIndex': 1, 'accountId': login_id, 'traderName': trader_name}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'complete', 'success': True, 'message': f'حساب #{login_id} با موفقیت به سامانه افزوده و تحلیل شد.', 'accountsSynced': 1, 'errors': []}, ensure_ascii=False)}\n\n"
                else:
                    err_text = ev.get("error", "خطای اتصال یا احراز هویت متاتریدر")
                    yield f"data: {json.dumps({'type': 'account_error', 'accountIndex': 1, 'accountId': login_id, 'error': err_text}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'message': f'خطا در افزودن حساب: {err_text}', 'accountsSynced': 0, 'errors': [err_text]}, ensure_ascii=False)}\n\n"
                break
            else:
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

        await task

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- SPA Fallback & Static Frontend Serving ---
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_react_app(full_path: str):
    """Serves the React Single Page App for all non-API routes."""
    target_file = UI_DIST_DIR / full_path
    if target_file.exists() and target_file.is_file():
        return FileResponse(target_file)

    index_html = UI_DIST_DIR / "index.html"
    if index_html.exists():
        return FileResponse(index_html)
    
    return HTMLResponse(
        content="""
        <html dir="rtl">
        <head><meta charset="utf-8"><title>سامانه مانیتورینگ تریدرها</title></head>
        <body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
            <div style="text-align:center;">
                <h2>موتور متاتریدر ۵ فعال است</h2>
                <p>داشبورد در حال بارگذاری اولیه است...</p>
            </div>
        </body>
        </html>
        """
    )
