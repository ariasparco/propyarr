//+------------------------------------------------------------------+
//|                                              PropinoBridge.mq5   |
//|  Pushes account state to the Propino risk engine from inside the |
//|  terminal, on every tick.                                        |
//+------------------------------------------------------------------+
//
// Why this exists
// ???????????????
// The Python agent logs into one account at a time through a single terminal,
// so while it watches one account the others are unobserved -- coverage is
// capped at roughly 1/N and a drawdown that recovers between visits is never
// seen. Polling from outside cannot fix that; it only moves the blind spots
// around.
//
// An Expert Advisor runs *inside* the terminal that is already logged in. It
// sees every tick, so equity is sampled continuously rather than at whatever
// moment a poller happened to arrive. Between pushes it keeps the worst point
// it saw, which is the figure the drawdown rules are actually judged against.
//
// One terminal per account is still required -- MetaTrader connects to one
// account at a time -- but the terminals run in parallel, so accounts no longer
// wait for each other.
//
// Setup, per terminal:
//   1. Copy this file to MQL5\Experts\ and compile it (F7 in MetaEditor).
//   2. Tools -> Options -> Expert Advisors -> tick "Allow WebRequest for listed
//      URL" and add the site origin, e.g. https://propino.top
//   3. Drag the EA onto any chart. The symbol does not matter -- account data
//      is account-wide -- but a liquid symbol ticks more often, so XAUUSD is a
//      good choice.
//   4. Set BridgeSecret to the BRIDGE_SECRET from the server's .env
//
#property copyright "Propino"
#property version   "1.00"
#property strict

input string SiteUrl      = "https://propino.top"; // Site origin, no trailing slash
input string BridgeSecret = "";                    // Must match BRIDGE_SECRET in .env
input int    PushSeconds  = 5;                     // How often to send (seconds)
input bool   VerboseLog   = false;                 // Log every push
input long   ExpectedLogin = 0;                    // Account this terminal must be on (0 = any)
input int    HistoryHours  = 96;                   // How far back to report closed trades
input int    HistorySeconds = 60;                  // How often to include trade history

// Worst points seen since the last push. These are what make the rules see the
// dip rather than the recovery.
double   g_minEquity      = 0;
// Balance moves only when a position closes, but it can move twice inside one
// push window: a losing close drops it under the line and a winning close
// lifts it back. The rules bind a drop in balance as firmly as a drop in
// equity, so the low has to be sampled, not read at push time.
double   g_minBalance     = 0;
double   g_worstFloating  = 0;
// The worst floating loss as a share of equity at that moment.
//
// The rule is 2.5% of *live* equity, so a peak recorded in dollars cannot be
// judged later against a different equity. Keeping the ratio makes the test
// exact whenever it is evaluated.
double   g_worstFloatPct  = 0;
int      g_maxOpen        = 0;
datetime g_lastPush       = 0;
bool     g_warnedSecret   = false;
bool     g_wrongAccount   = false;
bool     g_warnedNotReady = false;
datetime g_lastHistory    = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(BridgeSecret) == 0)
   {
      Print("PropinoBridge: BridgeSecret is empty -- set it in the EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(StringLen(SiteUrl) == 0)
   {
      Print("PropinoBridge: SiteUrl is empty.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   ResetWindow();
   g_lastPush = 0;   // push immediately on the first tick

   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   // Never cast a login to int. MetaTrader account numbers are 64-bit and
   // routinely exceed 2^31: 5055064423 truncates to 760097127, and that
   // truncated number is what this EA put in the JSON -- an account the server
   // had never heard of, so every push was discarded while the terminal was in
   // fact connected perfectly.
   PrintFormat("PropinoBridge started -- account #%s -> %s every %ds",
               IntegerToString(login), SiteUrl, PushSeconds);

   // Refuse to report an account this terminal was not meant to be on.
   //
   // When a stored investor password stops working the login fails quietly and
   // the broker's demo server hands out a brand new account instead. The EA
   // then runs perfectly and pushes figures belonging to an account nobody
   // asked about -- which would land in the platform under the wrong customer.
   if(ExpectedLogin > 0 && login != ExpectedLogin)
   {
      PrintFormat("PropinoBridge: WRONG ACCOUNT -- expected #%s but this terminal "
                  "is logged into #%s. The stored password for #%s is probably no "
                  "longer valid. Nothing will be pushed.",
                  IntegerToString(ExpectedLogin), IntegerToString(login),
                  IntegerToString(ExpectedLogin));
      g_wrongAccount = true;
   }

   // One second, not one push interval.
   //
   // Sampling used to happen only on ticks and once per push, so between pushes
   // a quiet symbol was not measured at all -- and the drawdown rules are
   // judged on the worst point reached, not the points that happened to be
   // sampled. A one second timer guarantees a floor on that resolution even
   // when the market is silent; pushing stays on its own slower clock.
   EventSetTimer(1);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   PrintFormat("PropinoBridge stopped (reason %d)", reason);
}

//+------------------------------------------------------------------+
void OnTick()   { Sample(); MaybePush(); }
void OnTimer()  { Sample(); MaybePush(); }

//+------------------------------------------------------------------+
//| Records the worst point seen since the last push.                |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Is the terminal actually talking to the broker yet?              |
//|                                                                  |
//| At startup the EA loads before the connection is established.    |
//| ACCOUNT_LOGIN already reports the configured number -- it comes  |
//| from the config file -- while ACCOUNT_EQUITY still reads 0. That |
//| zero was being pushed as a real equity reading, recorded as the  |
//| lowest equity ever seen, and every drawdown was then measured    |
//| against it: a healthy account failed at 2006% of its daily limit |
//| before its first tick.                                           |
//+------------------------------------------------------------------+
bool Ready()
{
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) return false;
   if(AccountInfoInteger(ACCOUNT_LOGIN) == 0)   return false;

   // Balance and equity both exactly zero is not an account state a broker
   // reports; it is what an unconnected terminal returns.
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   if(balance == 0.0 && equity == 0.0) return false;

   return true;
}

//+------------------------------------------------------------------+
void Sample()
{
   if(!Ready()) return;

   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   int    open    = PositionsTotal();

   if(g_minEquity == 0 || equity < g_minEquity) g_minEquity = equity;
   if(g_minBalance == 0 || balance < g_minBalance) g_minBalance = balance;
   if(open > g_maxOpen) g_maxOpen = open;

   // Every open position counts, from the first.
   //
   // This said `open >= 2` while the rules bind "the combined loss of open
   // trades at any moment" with no minimum count. With one position running,
   // the worst point between two pushes was reported as zero -- so a single
   // position that spiked past the allowance and recovered inside the five
   // second window was never seen.
   if(open >= 1)
   {
      double floating = balance - equity;
      if(floating > g_worstFloating) g_worstFloating = floating;

      // The allowance is a percentage of equity at that instant, so the ratio
      // is what has to be carried forward, not the amount.
      if(equity > 0)
      {
         double share = (floating / equity) * 100.0;
         if(share > g_worstFloatPct) g_worstFloatPct = share;
      }
   }
}

//+------------------------------------------------------------------+
void ResetWindow()
{
   g_minEquity     = 0;
   g_minBalance    = 0;
   g_worstFloating = 0;
   g_worstFloatPct = 0;
   g_maxOpen       = 0;
}

//+------------------------------------------------------------------+
void MaybePush()
{
   if(g_wrongAccount) return;

   // Silence is better than a wrong number. An unconnected terminal reporting
   // zeros looks to the rule engine exactly like an account that lost
   // everything.
   if(!Ready())
   {
      if(!g_warnedNotReady)
      {
         g_warnedNotReady = true;
         Print("PropinoBridge: waiting for the terminal to connect before pushing...");
      }
      return;
   }
   if(g_warnedNotReady)
   {
      g_warnedNotReady = false;
      PrintFormat("PropinoBridge: connected -- account #%s, balance %.2f",
                  IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
                  AccountInfoDouble(ACCOUNT_BALANCE));
   }

   if(TimeCurrent() - g_lastPush < PushSeconds) return;
   g_lastPush = TimeCurrent();
   Push();
   ResetWindow();
}

//+------------------------------------------------------------------+
//| Escapes a string for embedding in JSON.                          |
//+------------------------------------------------------------------+
string JsonEscape(const string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", " ");
   StringReplace(out, "\r", " ");
   StringReplace(out, "\t", " ");
   return out;
}

//+------------------------------------------------------------------+
//| ISO-8601 UTC, the shape the bridge validator accepts.            |
//|                                                                  |
//| Built from the broker's server clock, which is what MetaTrader   |
//| reports on positions. Whether that clock is UTC depends on the   |
//| broker, so the platform's dayResetUtcOffset setting has to match |
//| the same server for the trading-day boundary to line up.         |
//+------------------------------------------------------------------+
string IsoUtc(const datetime t)
{
   MqlDateTime d;
   TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

//+------------------------------------------------------------------+
//| Closed trades as a JSON array.                                   |
//|                                                                  |
//| Without this the platform sees balance and equity but no history,|
//| and every rule that reads trades goes quiet: trading days stay at |
//| zero so no account can ever pass, and the consistency, hold-time, |
//| instrument and cooldown rules have nothing to judge.              |
//|                                                                  |
//| MetaTrader stores one deal per fill, so a closed position is an   |
//| entry deal paired with an exit deal. The exits are what become    |
//| trades here -- one row per exit, so a position closed in parts is |
//| reported as the several trades it actually was, and the minimum   |
//| hold time is measured against each of them.                      |
//+------------------------------------------------------------------+
string DealsJson()
{
   datetime from = TimeCurrent() - (datetime)(HistoryHours * 3600);
   if(!HistorySelect(from, TimeCurrent() + 86400)) return "[]";

   int total = HistoryDealsTotal();
   if(total <= 0) return "[]";

   // First pass: when each position was opened, and at what price. An exit
   // deal knows its position id but not where that position began, and the
   // minimum-hold rule needs both ends.
   long   posIds[];
   long   posOpened[];
   double posPrice[];
   ArrayResize(posIds, total);
   ArrayResize(posOpened, total);
   ArrayResize(posPrice, total);
   int opens = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;

      posIds[opens]   = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      posOpened[opens] = HistoryDealGetInteger(ticket, DEAL_TIME);
      posPrice[opens] = HistoryDealGetDouble(ticket, DEAL_PRICE);
      opens++;
   }

   string rows = "";
   int sent = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT &&
         entry != DEAL_ENTRY_OUT_BY) continue;

      string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      if(StringLen(symbol) == 0) continue;   // a balance operation, not a trade

      long   posId  = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      long   closed = HistoryDealGetInteger(ticket, DEAL_TIME);
      long   opened = closed;
      double openPx = HistoryDealGetDouble(ticket, DEAL_PRICE);

      for(int k = 0; k < opens; k++)
      {
         if(posIds[k] == posId)
         {
            opened = posOpened[k];
            openPx = posPrice[k];
            break;
         }
      }

      // Net of costs. The broker books commission and swap separately, and a
      // platform judging drawdown on the gross figure is measuring money the
      // trader never had.
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                    + HistoryDealGetDouble(ticket, DEAL_COMMISSION)
                    + HistoryDealGetDouble(ticket, DEAL_SWAP)
                    + HistoryDealGetDouble(ticket, DEAL_FEE);

      // An exit deal runs opposite to the position it closes: selling closes a
      // buy. Reporting the deal's own direction would invert every trade.
      string side = (HistoryDealGetInteger(ticket, DEAL_TYPE) == DEAL_TYPE_SELL)
                    ? "BUY" : "SELL";

      if(StringLen(rows) > 0) rows += ",";
      rows += StringFormat(
         "{\"ticket\":\"%s\",\"symbol\":\"%s\",\"type\":\"%s\","
         "\"lot\":%.2f,\"profit\":%.2f,\"openPrice\":%.5f,"
         "\"closePrice\":%.5f,\"openedAt\":\"%s\",\"closedAt\":\"%s\"}",
         IntegerToString(ticket), JsonEscape(symbol), side,
         HistoryDealGetDouble(ticket, DEAL_VOLUME), profit, openPx,
         HistoryDealGetDouble(ticket, DEAL_PRICE),
         IsoUtc((datetime)opened), IsoUtc((datetime)closed));

      sent++;
      // The bridge accepts 2000 deals per push; stopping short of that keeps
      // one busy account from having its whole batch rejected.
      if(sent >= 1500) break;
   }

   return "[" + rows + "]";
}

//+------------------------------------------------------------------+
//| Open positions as a JSON array.                                  |
//+------------------------------------------------------------------+
string PositionsJson()
{
   string rows = "";
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      // Swap is booked separately from profit; the floating figure has to
      // include it or an overnight position looks better than it is.
      double profit = PositionGetDouble(POSITION_PROFIT)
                    + PositionGetDouble(POSITION_SWAP);
      double volume = PositionGetDouble(POSITION_VOLUME);
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);

      if(StringLen(rows) > 0) rows += ",";
      rows += StringFormat("{\"symbol\":\"%s\",\"profit\":%.2f,\"lot\":%.2f,\"openedAt\":\"%s\"}",
                           JsonEscape(symbol), profit, volume, IsoUtc(opened));
   }
   return "[" + rows + "]";
}

//+------------------------------------------------------------------+
//| Sends one snapshot to /api/bridge/accounts.                      |
//+------------------------------------------------------------------+
void Push()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   long   login   = AccountInfoInteger(ACCOUNT_LOGIN);

   double equityLow  = (g_minEquity == 0) ? equity : MathMin(g_minEquity, equity);
   double balanceLow = (g_minBalance == 0) ? balance : MathMin(g_minBalance, balance);

   // The broker's clock, relative to UTC.
   //
   // Every daily rule turns on where the trading day starts, and that boundary
   // is the broker's midnight -- not UTC's, and not the VPS's. It was a number
   // typed into the admin panel by hand, which meant it was wrong until someone
   // remembered to set it and wrong again twice a year when the server moved
   // for daylight saving. The terminal knows both clocks, so it reports the
   // difference and nobody has to remember anything.
   //
   // Rounded to the half hour: some brokers sit on :30 offsets, and anything
   // finer is drift between the two clocks rather than a real timezone.
   double offsetHours = (double)(TimeTradeServer() - TimeGMT()) / 3600.0;
   offsetHours = MathRound(offsetHours * 2.0) / 2.0;
   if(offsetHours < -12.0 || offsetHours > 14.0) offsetHours = 0.0;
   int    openNow   = PositionsTotal();
   int    openPeak  = MathMax(g_maxOpen, openNow);
   double floating  = g_worstFloating;
   double floatPct  = g_worstFloatPct;
   if(openNow >= 1)
   {
      double now = balance - equity;
      if(now > floating) floating = now;
      if(equity > 0)
      {
         double share = (now / equity) * 100.0;
         if(share > floatPct) floatPct = share;
      }
   }
   if(floating < 0) floating = 0;
   if(floatPct < 0) floatPct = 0;

   // History is heavy and changes only when a position closes, so it rides
   // along on a slower clock than the equity figures. The bridge keys deals by
   // ticket and merges them, so repeating a deal is harmless.
   bool withHistory = (TimeCurrent() - g_lastHistory) >= HistorySeconds;
   string deals = withHistory ? DealsJson() : "";
   if(withHistory) g_lastHistory = TimeCurrent();

   string body = StringFormat(
      "{\"accounts\":[{"
      "\"accountNumber\":\"%s\","
      "\"balance\":%.2f,"
      "\"equity\":%.2f,"
      "\"equityLow\":%.2f,"
      "\"balanceLow\":%.2f,"
      "\"floatingWorst\":%.2f,"
      "\"floatingWorstPct\":%.4f,"
      "\"openCountPeak\":%d,"
      "\"serverUtcOffset\":%.1f,"
      "\"positions\":%s%s"
      "}]}",
      IntegerToString(login), balance, equity, equityLow, balanceLow, floating,
      floatPct,
      openPeak, offsetHours, PositionsJson(),
      withHistory ? (",\"deals\":" + deals) : "");

   char   post[];
   char   result[];
   string headers = "Content-Type: application/json\r\n"
                    "Authorization: Bearer " + BridgeSecret + "\r\n";
   string resultHeaders;

   // Exactly the bytes of the JSON, no more and no less.
   //
   // StringToCharArray only appends a terminating zero when asked to convert
   // the WHOLE string (count = -1). Given an explicit count it copies that many
   // elements and nothing else, so subtracting one here removed a real
   // character -- the closing brace. Every push was rejected with 400
   // invalid_body while the EA itself looked healthy.
   int len = StringToCharArray(body, post, 0, StringLen(body), CP_UTF8);
   if(len < 0) len = 0;
   ArrayResize(post, len);

   ResetLastError();
   int status = WebRequest("POST", SiteUrl + "/api/bridge/accounts",
                           headers, 5000, post, result, resultHeaders);

   if(status == -1)
   {
      int err = GetLastError();
      if(err == 4014 && !g_warnedSecret)
      {
         g_warnedSecret = true;
         Print("PropinoBridge: WebRequest is not allowed for this URL. "
               "Tools -> Options -> Expert Advisors -> tick 'Allow WebRequest "
               "for listed URL' and add: ", SiteUrl);
      }
      else if(err != 4014)
      {
         PrintFormat("PropinoBridge: push failed, error %d", err);
      }
      return;
   }

   if(status == 403)
   {
      if(!g_warnedSecret)
      {
         g_warnedSecret = true;
         Print("PropinoBridge: rejected (403) -- BridgeSecret does not match "
               "BRIDGE_SECRET in the server's .env");
      }
      return;
   }

   if(status != 200)
   {
      // Print the reply. A bare status number cannot be acted on -- and MQL5
      // does not always return an HTTP code here, so the body is the only
      // thing that says what really happened.
      string reply = CharArrayToString(result, 0, MathMin(300, ArraySize(result)), CP_UTF8);
      StringReplace(reply, CharToString((uchar)10), " ");
      StringReplace(reply, CharToString((uchar)13), " ");
      PrintFormat("PropinoBridge: server answered %d -- %s", status, reply);
      return;
   }

   g_warnedSecret = false;
   if(VerboseLog)
      PrintFormat("PropinoBridge: #%s balance %.2f equity %.2f low %.2f open %d",
                  IntegerToString(login), balance, equity, equityLow, openNow);
}
//+------------------------------------------------------------------+
