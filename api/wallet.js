import { createClient } from "@supabase/supabase-js"
import { getPortfolioPurchasePause } from "./_portfolioPurchasePause.js"

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-paystack-signature")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.url, `http://${req.headers.host}`)
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0]

  if (action === "fund") {
    return res.status(503).json({
      success: false,
      code: "WALLET_FUNDING_TEMPORARILY_PAUSED",
      error: "Wallet deposits are temporarily paused while we complete an urgent balance-credit fix. No payment has been initiated."
    })

    try {
      const { userId, userEmail, amount } = req.body

      if (!userId || !userEmail || !amount || amount < 100) {
        return res.status(400).json({
          success: false,
          error: "Minimum funding amount is ₦100"
        })
      }

      if (!process.env.FLUTTERWAVE_SECRET_KEY) {
        console.error("[wallet-fund] MISSING FLUTTERWAVE_SECRET_KEY")
        return res.status(500).json({
          success: false,
          error: "Payment system not configured"
        })
      }

      const reference = "wallet_fund_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8)

      const metadata = {
        type: "wallet_funding",
        userId,
        userEmail,
        amount
      }

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.plugsy.ng"

      const flwRes = await fetch(
        "https://api.flutterwave.com/v3/payments",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.FLUTTERWAVE_SECRET_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tx_ref: reference,
            amount: amount,
            currency: "NGN",
            redirect_url: siteUrl + "/wallet/callback",
            customer: {
              email: userEmail,
              name: userEmail.split("@")[0]
            },
            customizations: {
              title: "Plugsy Wallet Top-up",
              description: "Fund Plugsy Wallet"
            },
            meta: metadata
          })
        }
      )

      const flwData = await flwRes.json()
      console.log("[wallet-fund] flutterwave init:", flwData.status)

      if (flwData.status !== "success" || !flwData.data?.link) {
        return res.status(400).json({
          success: false,
          error: "Flutterwave error: " + (flwData.message || "Failed to initialize top-up")
        })
      }

      // Create pending transaction record
      const { error: insertError } = await supabase.from("wallet_transactions").insert({
        user_id: userId,
        user_email: userEmail,
        type: "fund",
        amount,
        status: "pending",
        reference,
        description: "Wallet top-up via Flutterwave"
      })

      console.log("[wallet-fund] transaction record insert error:", insertError)

      return res.status(200).json({
        success: true,
        authorization_url: flwData.data.link,
        reference
      })

    } catch (e) {
      console.error("[wallet-fund] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "webhook") {
    try {
      const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;
      const headerHash = req.headers["verif-hash"];

      if (secretHash && headerHash && headerHash !== secretHash) {
        return res.status(401).json({ error: "Invalid signature" })
      }

      const event = typeof req.body === "object" ? req.body : JSON.parse(req.body)
      const eventName = event.event || event["event.type"] || ""
      const eventData = event.data || {}

      if (eventName !== "charge.completed" && eventData.status !== "successful") {
        return res.status(200).json({ received: true })
      }

      const meta = eventData.meta || eventData.metadata || event.meta || {}
      if (meta.type !== "wallet_funding") {
        console.log("[wallet-webhook] not wallet funding, skipping")
        return res.status(200).json({ received: true })
      }

      const reference = eventData.tx_ref || eventData.reference
      const amount = Number(eventData.amount)
      const userId = meta.userId

      console.log("[wallet-webhook] funding:", userId, amount)

      // Check duplicate
      const { data: existingTx } = await supabase
        .from("wallet_transactions")
        .select("id, status")
        .eq("reference", reference)
        .maybeSingle()

      if (existingTx?.status === "success") {
        console.log("[wallet-webhook] already processed")
        return res.status(200).json({ received: true })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("clerk_id", userId)
        .single()

      const balanceBefore = profile?.balance || 0
      const balanceAfter = balanceBefore + amount

      await supabase
        .from("profiles")
        .update({ balance: balanceAfter })
        .eq("clerk_id", userId)

      await supabase
        .from("wallet_transactions")
        .update({
          status: "success",
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          updated_at: new Date().toISOString()
        })
        .eq("reference", reference)

      await supabase.from("messages").insert({
        sender_id: "system",
        sender_role: "system",
        sender_name: "Plugsy",
        content: "💰 Your wallet has been funded with ₦" +
          amount.toLocaleString() + ". New balance: ₦" +
          balanceAfter.toLocaleString(),
        user_id: userId,
        event: "wallet_funded",
        topic: "wallet",
        is_from_user: false,
        is_bot: true,
        is_bot_message: true,
        read_by_admin: true,
        read_by_user: false
      })

      return res.status(200).json({ received: true })

    } catch (e) {
      console.error("[wallet-webhook] crash:", e.message)
      return res.status(200).json({ received: true })
    }
  }

  if (action === "verify") {
    const { reference } = req.body
    const { data: tx } = await supabase
      .from("wallet_transactions")
      .select("status, amount, balance_after")
      .eq("reference", reference)
      .maybeSingle()

    if (tx?.status === "success") {
      return res.status(200).json({ success: true, tx })
    }

    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
      { headers: { Authorization: "Bearer " + process.env.FLUTTERWAVE_SECRET_KEY } }
    )
    const flwData = await flwRes.json()

    if (flwData.status === "success" && flwData.data?.status === "successful") {
      return res.status(200).json({ success: true, pending: true })
    }
    
    if (flwData.data?.status === "failed" || flwData.status === "error") {
      await supabase
        .from("wallet_transactions")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending")
    }

    return res.status(400).json({ success: false, error: "Payment not verified" })
  }

  if (action === "resolve-account") {
    try {
      const { accountNumber, bankCode } = req.body

      const res2 = await fetch(
        "https://api.flutterwave.com/v3/accounts/resolve",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.FLUTTERWAVE_SECRET_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            account_number: accountNumber,
            account_bank: bankCode
          })
        }
      )
      const data = await res2.json()
      console.log("[resolve-account] result:", data.status, data.data?.account_name)

      if (data.status !== "success" || !data.data?.account_name) {
        return res.status(400).json({ success: false, error: data.message || "Account resolve failed" })
      }

      return res.status(200).json({
        success: true,
        accountName: data.data.account_name
      })
    } catch (e) {
      console.error("[resolve-account] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "save-bank") {
    try {
      const { userId, accountNumber, bankCode, bankName, accountName } = req.body

      await supabase
        .from("profiles")
        .update({
          bank_code: bankCode,
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName
        })
        .eq("clerk_id", userId)

      return res.status(200).json({ success: true })

    } catch (e) {
      console.error("[save-bank] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "withdraw") {
    try {
      const { userId, userEmail, amount, pin } = req.body

      const MIN_WITHDRAWAL = 1000
      
      const getWithdrawalFee = (val) => {
        const amt = Number(val) || 0;
        if (amt < 1000) return 25;
        if (amt < 10000) return 25;
        if (amt < 100000) return 100;
        if (amt < 1000000) return 500;
        return 5000;
      };
      const FEE = getWithdrawalFee(amount);

      if (!amount || amount < MIN_WITHDRAWAL) {
        return res.status(400).json({
          success: false,
          error: "Minimum withdrawal is ₦" + MIN_WITHDRAWAL.toLocaleString()
        })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_id", userId)
        .single()

      if (!profile) {
        return res.status(400).json({
          success: false,
          error: "Profile not found"
        })
      }

      // 1. Check if PIN is set and verify it
      let dbPin = null;
      if ("wallet_pin" in profile) {
        dbPin = profile.wallet_pin;
      } else {
        try {
          if (profile.phone_number && profile.phone_number.startsWith("{")) {
            const parsed = JSON.parse(profile.phone_number);
            dbPin = parsed.pin;
          }
        } catch (err) {}
      }

      if (!dbPin) {
        return res.status(400).json({
          success: false,
          error: "Wallet Security PIN is not set. Please set up your PIN in Wallet settings first."
        });
      }

      if (!pin) {
        return res.status(400).json({
          success: false,
          error: "Security PIN is required to authorize withdrawals."
        });
      }

      const crypto = await import("crypto");
      const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

      if (dbPin !== hashedPin) {
        return res.status(400).json({
          success: false,
          error: "Invalid Security PIN. Authorization failed."
        });
      }

      if (!profile.account_number) {
        return res.status(400).json({
          success: false,
          error: "Please add your bank account first"
        })
      }

      const totalDeduction = Number(amount) + FEE

      if ((profile.balance || 0) < totalDeduction) {
        return res.status(400).json({
          success: false,
          error: "Insufficient wallet balance"
        })
      }

      const reference = "wallet_wd_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8)

      // Deduct immediately (pending) to prevent double-withdraw
      const balanceBefore = profile.balance
      const balanceAfter = balanceBefore - totalDeduction

      await supabase
        .from("profiles")
        .update({ balance: balanceAfter })
        .eq("clerk_id", userId)

      await supabase.from("wallet_transactions").insert({
        user_id: userId,
        user_email: userEmail,
        type: "withdraw",
        amount,
        fee: FEE,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        status: "pending",
        reference,
        description: "Withdrawal to " + profile.account_name
      })

      // Sync withdrawal record to the withdrawals table so admin can track/process it
      try {
        await supabase.from("withdrawals").insert({
          user_id: userId,
          amount,
          bank_name: profile.bank_name || "Unknown Bank",
          account_number: profile.account_number || "",
          account_name: profile.account_name || "",
          status: "pending",
          user_email: userEmail,
          user_name: profile.full_name || profile.account_name || "User",
          created_at: new Date().toISOString()
        })
        console.log("[withdraw] successfully mirrored withdrawal to withdrawals table");
      } catch (mirrorErr) {
        console.error("[withdraw] failed to mirror to withdrawals table:", mirrorErr.message);
      }

      // Initiate Flutterwave transfer
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.plugsy.ng";
      const transferRes = await fetch(
        "https://api.flutterwave.com/v3/transfers",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.FLUTTERWAVE_SECRET_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            account_bank: profile.bank_code,
            account_number: profile.account_number,
            amount: Number(amount),
            narration: "Plugsy Wallet Withdrawal",
            currency: "NGN",
            reference: reference,
            callback_url: siteUrl + "/api/wallet?action=transfer-webhook"
          })
        }
      )
      const transferData = await transferRes.json()
      console.log("[withdraw] flutterwave transfer result:", transferData.status, transferData.message)

      if (transferData.status !== "success") {
        // Refund the deduction since transfer failed to even initiate
        await supabase
          .from("profiles")
          .update({ balance: balanceBefore })
          .eq("clerk_id", userId)

        await supabase
          .from("wallet_transactions")
          .update({ status: "failed" })
          .eq("reference", reference)

        return res.status(400).json({
          success: false,
          error: transferData.message || "Transfer initiation failed"
        })
      }

      const flwStatus = transferData.data?.status;
      const isCompleted = flwStatus === "SUCCESSFUL" || (process.env.FLUTTERWAVE_SECRET_KEY && process.env.FLUTTERWAVE_SECRET_KEY.startsWith("FLWSECK_TEST"));

      if (isCompleted) {
        await supabase
          .from("wallet_transactions")
          .update({ status: "success", updated_at: new Date().toISOString() })
          .eq("reference", reference);

        await supabase
          .from("withdrawals")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            confirmed_by: "flutterwave_auto"
          })
          .eq("user_id", userId)
          .eq("amount", amount)
          .eq("status", "pending");

        console.log("[withdraw] Transfer completed immediately or in test mode. Automatically marked as success.");
      }

      return res.status(200).json({
        success: true,
        message: isCompleted ? "Withdrawal completed successfully." : "Withdrawal initiated. Funds will arrive shortly."
      })

    } catch (e) {
      console.error("[withdraw] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "transfer-webhook") {
    try {
      const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;
      const headerHash = req.headers["verif-hash"];

      if (secretHash && headerHash && headerHash !== secretHash) {
        return res.status(401).json({ error: "Invalid signature" })
      }

      const event = typeof req.body === "object" ? req.body : JSON.parse(req.body)
      const eventData = event.data || {}
      const reference = eventData.reference || eventData.tx_ref

      if (eventData.status === "SUCCESSFUL") {
        await supabase
          .from("wallet_transactions")
          .update({ status: "success", updated_at: new Date().toISOString() })
          .eq("reference", reference)

        const { data: tx } = await supabase
          .from("wallet_transactions")
          .select("user_id, amount")
          .eq("reference", reference)
          .maybeSingle()

        if (tx) {
          await supabase
            .from("withdrawals")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              confirmed_by: "flutterwave_webhook"
            })
            .eq("user_id", tx.user_id)
            .eq("amount", tx.amount)
            .eq("status", "pending")

          await supabase.from("messages").insert({
            sender_id: "system",
            sender_role: "system",
            sender_name: "Plugsy",
            content: "✅ Your withdrawal of ₦" + tx.amount.toLocaleString() +
              " has been sent to your bank account.",
            user_id: tx.user_id,
            event: "withdrawal_success",
            topic: "wallet",
            is_from_user: false,
            is_bot: true,
            is_bot_message: true,
            read_by_admin: true,
            read_by_user: false
          })
        }
      } else {
        const { data: tx } = await supabase
          .from("wallet_transactions")
          .select("user_id, user_email, amount, fee, balance_before")
          .eq("reference", reference)
          .maybeSingle()

        if (tx) {
          await supabase
            .from("withdrawals")
            .update({
              status: "failed",
              admin_note: "Flutterwave transfer failed: " + (eventData.complete_message || "Transfer error")
            })
            .eq("user_id", tx.user_id)
            .eq("amount", tx.amount)
            .eq("status", "pending")

          const { data: profile } = await supabase
            .from("profiles")
            .select("balance")
            .eq("clerk_id", tx.user_id)
            .maybeSingle()

          const refundedBalance = (profile?.balance || 0) + tx.amount + tx.fee

          await supabase
            .from("profiles")
            .update({ balance: refundedBalance })
            .eq("clerk_id", tx.user_id)

          await supabase
            .from("wallet_transactions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("reference", reference)

          await supabase.from("messages").insert({
            sender_id: "system",
            sender_role: "system",
            sender_name: "Plugsy",
            content: "⚠️ Your withdrawal failed and ₦" +
              (tx.amount + tx.fee).toLocaleString() +
              " has been refunded to your wallet.",
            user_id: tx.user_id,
            event: "withdrawal_failed",
            topic: "wallet",
            is_from_user: false,
            is_bot: true,
            is_bot_message: true,
            read_by_admin: true,
            read_by_user: false
          })
        }
      }

      return res.status(200).json({ received: true })

    } catch (e) {
      console.error("[transfer-webhook] crash:", e.message)
      return res.status(200).json({ received: true })
    }
  }

  if (action === "pay-with-wallet") {
    try {
      const { userId, userEmail, amount, purpose, purposeData } = req.body
      // purpose: "capcut_order" | "portfolio_purchase"
      // purposeData: whatever metadata that flow needs

      const portfolioPurchasePause = getPortfolioPurchasePause(purpose)
      if (portfolioPurchasePause) {
        return res.status(503).json(portfolioPurchasePause)
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("clerk_id", userId)
        .single()

      if (!profile || (profile.balance || 0) < amount) {
        return res.status(400).json({
          success: false,
          error: "Insufficient wallet balance"
        })
      }

      const reference = "wallet_pay_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8)

      const balanceBefore = profile.balance
      const balanceAfter = balanceBefore - amount

      await supabase
        .from("profiles")
        .update({ balance: balanceAfter })
        .eq("clerk_id", userId)

      const desc = purpose ? purpose.replace(/_/g, ' ') : "Purchase";
      await supabase.from("wallet_transactions").insert({
        user_id: userId,
        user_email: userEmail,
        type: "purchase",
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        status: "success",
        reference,
        description: "Wallet Payment For " + desc,
        metadata: purposeData || {}
      })

      return res.status(200).json({
        success: true,
        reference,
        message: "Paid with wallet"
      })

    } catch (e) {
      console.error("[pay-with-wallet] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "list-banks") {
    try {
      const res2 = await fetch(
        "https://api.flutterwave.com/v3/banks/NG",
        {
          headers: {
            Authorization: "Bearer " + process.env.FLUTTERWAVE_SECRET_KEY
          }
        }
      )
      const data = await res2.json()

      if (data.status !== "success" || !Array.isArray(data.data)) {
        return res.status(400).json({ success: false, error: data.message || "Failed to list banks" })
      }

      // Sort alphabetically, keep only name + code and deduplicate
      const seen = new Set();
      const banks = (data.data || [])
        .filter((b) => {
          if (!b.code || seen.has(b.code)) return false;
          seen.add(b.code);
          return true;
        })
        .map((b) => ({ name: b.name, code: b.code }))
        .sort((a, b) => a.name.localeCompare(b.name))

      console.log("[list-banks] total banks:", banks.length)

      return res.status(200).json({ success: true, banks })

    } catch (e) {
      console.error("[list-banks] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "set-pin") {
    try {
      const { userId, pin, require_pin_view } = req.body;
      if (!userId || !pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ success: false, error: "PIN must be a 4-digit number" });
      }

      const crypto = await import("crypto");
      const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

      const { data: profile, error: fetchErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_id", userId)
        .single();

      if (fetchErr || !profile) {
        return res.status(400).json({ success: false, error: "Profile not found" });
      }

      const updatePayload = {};
      if ("wallet_pin" in profile) {
        updatePayload.wallet_pin = hashedPin;
        updatePayload.require_pin_view = require_pin_view ?? false;
      } else {
        updatePayload.phone_number = JSON.stringify({ pin: hashedPin, require_pin_view: require_pin_view ?? false });
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("clerk_id", userId);

      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true, message: "Security PIN updated successfully!" });
    } catch (e) {
      console.error("[set-pin] error:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (action === "update-pin-settings") {
    try {
      const { userId, require_pin_view } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: "User ID is required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_id", userId)
        .single();

      if (!profile) {
        return res.status(400).json({ success: false, error: "Profile not found" });
      }

      const updatePayload = {};
      if ("wallet_pin" in profile) {
        updatePayload.require_pin_view = !!require_pin_view;
      } else {
        let currentPin = null;
        try {
          if (profile.phone_number && profile.phone_number.startsWith("{")) {
            const parsed = JSON.parse(profile.phone_number);
            currentPin = parsed.pin;
          }
        } catch (err) {}
        updatePayload.phone_number = JSON.stringify({ pin: currentPin, require_pin_view: !!require_pin_view });
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("clerk_id", userId);

      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true, message: "Settings updated successfully" });
    } catch (e) {
      console.error("[update-pin-settings] error:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (action === "verify-pin") {
    try {
      const { userId, pin } = req.body;
      if (!userId || !pin) {
        return res.status(400).json({ success: false, error: "User ID and PIN are required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_id", userId)
        .single();

      if (!profile) {
        return res.status(400).json({ success: false, error: "Profile not found" });
      }

      let dbPin = null;
      if ("wallet_pin" in profile) {
        dbPin = profile.wallet_pin;
      } else {
        try {
          if (profile.phone_number && profile.phone_number.startsWith("{")) {
            const parsed = JSON.parse(profile.phone_number);
            dbPin = parsed.pin;
          }
        } catch (err) {}
      }

      if (!dbPin) {
        return res.status(200).json({ success: false, noPin: true, error: "PIN is not set yet" });
      }

      const crypto = await import("crypto");
      const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

      if (dbPin !== hashedPin) {
        return res.status(400).json({ success: false, error: "Incorrect PIN" });
      }

      return res.status(200).json({ success: true, message: "PIN verified successfully" });
    } catch (e) {
      console.error("[verify-pin] error:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (action === "p2p-transfer") {
    try {
      const { senderId, senderEmail, recipientUsername, amount, note } = req.body

      const TRANSFER_FEE = 0

      if (!amount || amount < 10) {
        return res.status(400).json({
          success: false,
          error: "Minimum transfer is ₦10"
        })
      }

      const cleanUsername = (recipientUsername || "").trim().toLowerCase()
      if (!cleanUsername) {
        return res.status(400).json({
          success: false,
          error: "Enter a recipient username"
        })
      }

      // Find recipient
      const { data: recipient } = await supabase
        .from("profiles")
        .select("clerk_id, email, full_name, username, balance")
        .eq("username", cleanUsername)
        .maybeSingle()

      if (!recipient) {
        return res.status(404).json({
          success: false,
          error: "No Plugsy user found with that username"
        })
      }

      if (recipient.clerk_id === senderId) {
        return res.status(400).json({
          success: false,
          error: "You cannot send money to yourself"
        })
      }

      // Check sender balance
      const { data: sender } = await supabase
        .from("profiles")
        .select("balance")
        .eq("clerk_id", senderId)
        .single()

      const totalDeduction = Number(amount) + TRANSFER_FEE

      if (!sender || (sender.balance || 0) < totalDeduction) {
        return res.status(400).json({
          success: false,
          error: "Insufficient wallet balance"
        })
      }

      const reference = "p2p_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8)

      const senderBalanceBefore = sender.balance
      const senderBalanceAfter = senderBalanceBefore - totalDeduction

      const recipientBalanceBefore = recipient.balance || 0
      const recipientBalanceAfter = recipientBalanceBefore + Number(amount)

      // Debit sender
      const { error: debitError } = await supabase
        .from("profiles")
        .update({ balance: senderBalanceAfter })
        .eq("clerk_id", senderId)

      if (debitError) {
        console.error("[p2p-transfer] Debit sender error:", debitError)
        return res.status(500).json({
          success: false,
          error: "Debit sender balance failed: " + debitError.message
        })
      }

      // Credit recipient
      const { error: creditError } = await supabase
        .from("profiles")
        .update({ balance: recipientBalanceAfter })
        .eq("clerk_id", recipient.clerk_id)

      if (creditError) {
        console.error("[p2p-transfer] Credit recipient error:", creditError)
        return res.status(500).json({
          success: false,
          error: "Credit recipient balance failed: " + creditError.message
        })
      }

      // Log sender transaction
      const { error: senderTxError } = await supabase.from("wallet_transactions").insert({
        user_id: senderId,
        user_email: senderEmail,
        type: "p2p_send",
        amount: Number(amount),
        fee: TRANSFER_FEE,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        status: "success",
        reference,
        description: "Sent to @" + recipient.username +
          (note ? " — " + note : ""),
        metadata: { recipientUsername: recipient.username }
      })

      if (senderTxError) {
        console.error("[p2p-transfer] Sender transaction log error:", senderTxError)
        return res.status(500).json({
          success: false,
          error: "Logging sender transaction failed: " + senderTxError.message
        })
      }

      // Log recipient transaction
      const { error: recipientTxError } = await supabase.from("wallet_transactions").insert({
        user_id: recipient.clerk_id,
        user_email: recipient.email,
        type: "p2p_receive",
        amount: Number(amount),
        fee: 0,
        balance_before: recipientBalanceBefore,
        balance_after: recipientBalanceAfter,
        status: "success",
        reference: reference + "_r",
        description: "Received from a Plugsy user" +
          (note ? " — " + note : ""),
        metadata: { senderId }
      })

      if (recipientTxError) {
        console.error("[p2p-transfer] Recipient transaction log error:", recipientTxError)
        return res.status(500).json({
          success: false,
          error: "Logging recipient transaction failed: " + recipientTxError.message
        })
      }

      // Notify recipient via chat message
      const { error: notifyError } = await supabase.from("messages").insert({
        sender_id: "system",
        sender_role: "system",
        sender_name: "Plugsy",
        content: "💸 You received ₦" + Number(amount).toLocaleString() +
          " from a Plugsy user" + (note ? ": \"" + note + "\"" : "") +
          ". New balance: ₦" + recipientBalanceAfter.toLocaleString(),
        user_id: recipient.clerk_id,
        event: "p2p_received",
        topic: "wallet",
        is_from_user: false,
        is_bot: true,
        is_bot_message: true,
        read_by_admin: true,
        read_by_user: false
      })

      if (notifyError) {
        console.error("[p2p-transfer] Recipient notification warning (non-fatal):", notifyError)
      }

      return res.status(200).json({
        success: true,
        reference,
        message: "Sent ₦" + Number(amount).toLocaleString() +
          " to @" + recipient.username
      })

    } catch (e) {
      console.error("[p2p-transfer] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "resolve-username") {
    try {
      const { username } = req.body
      const clean = (username || "").trim().toLowerCase()

      const { data: user } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("username", clean)
        .maybeSingle()

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" })
      }

      return res.status(200).json({
        success: true,
        fullName: user.full_name || "@" + user.username
      })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "update-username") {
    try {
      const { userId, username } = req.body;
      if (!userId || !username) {
        return res.status(400).json({ success: false, error: "Missing userId or username" });
      }
      
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean.length < 3) {
        return res.status(400).json({ success: false, error: "Username too short" });
      }

      // Check if taken
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, clerk_id")
        .eq("username", clean)
        .maybeSingle();

      if (existing && existing.clerk_id !== userId) {
        return res.status(400).json({ success: false, error: "Username already taken" });
      }

      let { error, data } = await supabase
        .from("profiles")
        .update({ username: clean })
        .eq("clerk_id", userId)
        .select();

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      if (!data || data.length === 0) {
        // Fallback: Create the profile if it doesn't exist yet!
        const email = req.body.email || "";
        const insertPayload = {
          clerk_id: userId,
          email: email,
          username: clean,
          full_name: email ? email.split("@")[0] : "Plugsy User",
          role: "user",
          updated_at: new Date().toISOString()
        };

        const { error: insertError, data: insertData } = await supabase
          .from("profiles")
          .insert(insertPayload)
          .select();

        if (insertError) {
          return res.status(500).json({ success: false, error: "Profile missing and failed to auto-create: " + insertError.message });
        }
        data = insertData;
      }

      return res.status(200).json({ success: true, username: clean });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(404).json({ error: "Action not found" })
}
