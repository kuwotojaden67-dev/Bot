//+------------------------------------------------------------------+
//|                                              TwoRealBridgeEA.mq5 |
//|                                            2REAL AI TRADER V1.0  |
//|      Local Authenticated Execution & Market Data Bridge for MT5  |
//+------------------------------------------------------------------+
#property copyright "2REAL AI TRADER"
#property link      "http://127.0.0.1:8000"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//--- Input Parameters
input string   InpLocalBackendUrl  = "http://127.0.0.1:8000/api/ea-webhook"; // Local Backend Endpoint (localhost only)
input string   InpSharedSecret     = "change_me_in_2real_vault";             // HMAC Shared Secret from 2REAL Setup
input int      InpPollIntervalMs   = 500;                                    // Timer Poll Interval (ms)
input int      InpMagicNumber      = 20261012;                               // EA Magic Number
input int      InpMaxSlippagePts   = 15;                                     // Max Deviation in Points
input bool     InpAllowOrderExec   = true;                                   // Allow Order Execution from Local Engine

CTrade         g_trade;
CPositionInfo  g_position;
CAccountInfo   g_account;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringFind(InpLocalBackendUrl, "127.0.0.1") < 0 && StringFind(InpLocalBackendUrl, "localhost") < 0)
   {
      Print("[2REAL SECURITY BLOCK] InpLocalBackendUrl must bind strictly to 127.0.0.1 / localhost.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetAsyncMode(false);

   EventSetMillisecondTimer(InpPollIntervalMs);
   Print("[2REAL AI TRADER] TwoRealBridgeEA initialized on ", _Symbol, " | Magic=", InpMagicNumber);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("[2REAL AI TRADER] TwoRealBridgeEA stopped. Reason=", reason);
}

//+------------------------------------------------------------------+
//| Build Account & Open Position Snapshot JSON                      |
//+------------------------------------------------------------------+
string BuildAccountSnapshotJson()
{
   long   login        = AccountInfoInteger(ACCOUNT_LOGIN);
   long   leverage     = AccountInfoInteger(ACCOUNT_LEVERAGE);
   long   trade_mode   = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   double balance      = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity       = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin       = AccountInfoDouble(ACCOUNT_MARGIN);
   double free_margin  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double margin_level = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   double profit       = AccountInfoDouble(ACCOUNT_PROFIT);
   string currency     = AccountInfoString(ACCOUNT_CURRENCY);
   string company      = AccountInfoString(ACCOUNT_COMPANY);
   string server       = AccountInfoString(ACCOUNT_SERVER);
   string mode_str     = (trade_mode == ACCOUNT_TRADE_MODE_REAL) ? "LIVE" : "DEMO";

   string json = StringFormat(
      "{\"login\":%I64d,\"broker\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\","
      "\"leverage\":%I64d,\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,"
      "\"free_margin\":%.2f,\"margin_level\":%.2f,\"floating_pnl\":%.2f,\"trading_mode\":\"%s\"}",
      login, company, server, currency, leverage,
      balance, equity, margin, free_margin, margin_level, profit, mode_str
   );
   return json;
}

//+------------------------------------------------------------------+
//| Execute Approved Trade Command from Local Python Engine          |
//+------------------------------------------------------------------+
bool ExecuteValidatedOrder(
   string symbol,
   string direction,
   double volume,
   double sl,
   double tp,
   string comment,
   ulong &out_ticket,
   uint &out_retcode,
   string &out_retcode_desc
)
{
   out_ticket = 0;
   out_retcode = 0;
   out_retcode_desc = "";

   if(!InpAllowOrderExec)
   {
      out_retcode_desc = "EA_EXECUTION_DISABLED_BY_INPUT";
      return false;
   }

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      out_retcode_desc = "TERMINAL_ALGO_TRADING_DISABLED";
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      out_retcode_desc = "SYMBOL_TICK_UNAVAILABLE";
      return false;
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double norm_sl = NormalizeDouble(sl, digits);
   double norm_tp = NormalizeDouble(tp, digits);

   bool ok = false;
   if(direction == "BUY")
      ok = g_trade.Buy(volume, symbol, NormalizeDouble(tick.ask, digits), norm_sl, norm_tp, comment);
   else if(direction == "SELL")
      ok = g_trade.Sell(volume, symbol, NormalizeDouble(tick.bid, digits), norm_sl, norm_tp, comment);

   out_retcode = g_trade.ResultRetcode();
   out_retcode_desc = g_trade.ResultRetcodeDescription();
   if(ok && out_retcode == TRADE_RETCODE_DONE)
   {
      out_ticket = g_trade.ResultOrder();
      return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Close Position by Ticket                                         |
//+------------------------------------------------------------------+
bool ClosePositionByTicket(ulong ticket, uint &out_retcode, string &out_desc)
{
   if(!g_position.SelectByTicket(ticket))
   {
      out_retcode = 0;
      out_desc = "POSITION_NOT_FOUND";
      return false;
   }
   bool closed = g_trade.PositionClose(ticket, InpMaxSlippagePts);
   out_retcode = g_trade.ResultRetcode();
   out_desc = g_trade.ResultRetcodeDescription();
   return (closed && out_retcode == TRADE_RETCODE_DONE);
}

//+------------------------------------------------------------------+
//| Timer heartbeat to local FastAPI engine                          |
//+------------------------------------------------------------------+
void OnTimer()
{
   string payload = BuildAccountSnapshotJson();
   char post_data[];
   char result_data[];
   string result_headers;
   StringToCharArray(payload, post_data, 0, StringLen(payload));

   string headers = "Content-Type: application/json\r\nX-2Real-EA-Secret: " + InpSharedSecret + "\r\n";
   ResetLastError();
   int res = WebRequest("POST", InpLocalBackendUrl, headers, 1000, post_data, result_data, result_headers);
   if(res == -1)
   {
      // WebRequest requires URL whitelisting in Tools -> Options -> Expert Advisors
      return;
   }
}
//+------------------------------------------------------------------+
