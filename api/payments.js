import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// --- Webhook body parser ---
async function readBody(req) {
  if (req.rawBody) return req.rawBody.toString();
  if (req.body) {
    if (typeof req.body === 'string') return req.body;
    return JSON.stringify(req.body);
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

// --- Medal Helpers ---
async function getUserActiveMedal(supabase, userId) {
  if (!userId) return null;
  
  // 1. Try profile first (synced cache)
  const { data: profile } = await supabase
    .from("profiles")
    .select("medal_tier, medal_number")
    .eq("clerk_id", userId)
    .maybeSingle();
    
  if (profile?.medal_tier) {
    const tier = profile.medal_tier;
    if (tier === "Gold") return { tier: "20k", name: "Plugsy Gold Medal", discount: 0.50, commissionBonus: 0.20 };
    if (tier === "Silver") return { tier: "15k", name: "Plugsy Silver Medal", discount: 0.30, commissionBonus: 0.15 };
    if (tier === "Bronze") return { tier: "8k", name: "Plugsy Bronze Medal", discount: 0.15, commissionBonus: 0.10 };
  }

  // 2. Fallback to orders (flexible matching)
  const { data: medalOrders } = await supabase
    .from("orders")
    .select("product_name")
    .eq("user_id", userId)
    .in("status", ["paid", "completed"])
    .order("created_at", { ascending: false });

  if (!medalOrders || medalOrders.length === 0) return null;

  for (const order of medalOrders) {
    const name = order.product_name?.toLowerCase() || "";
    if (name.includes("gold") || name.includes("20k")) {
      return { tier: "20k", name: "Plugsy Gold Medal", discount: 0.50, commissionBonus: 0.20 };
    }
    if (name.includes("silver") || name.includes("15k")) {
      return { tier: "15k", name: "Plugsy Silver Medal", discount: 0.30, commissionBonus: 0.15 };
    }
    if (name.includes("bronze") || name.includes("8k")) {
      return { tier: "8k", name: "Plugsy Bronze Medal", discount: 0.15, commissionBonus: 0.10 };
    }
  }
  
  return null;
}

async function getUserMedalNumber(supabase, userId) {
  if (!userId) return null;
  
  // 1. Try profile first
  const { data: profile } = await supabase
    .from("profiles")
    .select("medal_number")
    .eq("clerk_id", userId)
    .maybeSingle();
    
  if (profile?.medal_number) return profile.medal_number;

  // 2. Fallback to calculating from orders
  const { data: allOrders } = await supabase
    .from("orders")
    .select("id, user_id, product_name, created_at")
    .in("status", ["paid", "completed"])
    .order("created_at", { ascending: true });

  if (!allOrders) return null;

  const medalOrders = allOrders.filter(o => o.product_name?.toLowerCase().includes("medal") || o.product_name?.includes("8k") || o.product_name?.includes("15k") || o.product_name?.includes("20k"));
  const userIndex = medalOrders.findIndex(o => o.user_id === userId);
  
  return userIndex !== -1 ? userIndex + 1 : null;
}

// --- Handlers ---
async function handleInitialize(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody);

    const {
      userId, userEmail, fullName, planId,
      purchaseCodeUsed, purchaseCodeOwnerId, purchaseCodeOwnerName
    } = body;

    if (!userEmail) return res.status(400).json({ success: false, error: "Missing userEmail" });
    if (!planId) return res.status(400).json({ success: false, error: "Missing planId" });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.plugsy.ng";

    if (!supabaseUrl || !supabaseKey || !flwKey) {
      return res.status(500).json({ success: false, error: "Missing Flutterwave / Supabase config" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: plan, error: planError } = await supabase.from("plans").select("*").eq("id", planId).single();
    if (planError || !plan) return res.status(400).json({ success: false, error: "Plan not found" });

    const now = new Date();
    const discountPrice = plan.discount_price != null ? plan.discount_price : (plan.discountPrice != null ? plan.discountPrice : null);
    const discountExpiry = plan.discount_expires_at;

    const hasValidDiscount = (discountPrice !== null && Number(discountPrice) > 0 && Number(discountPrice) < Number(plan.price) && (!discountExpiry || new Date(discountExpiry) > now));
    const basePrice = hasValidDiscount ? Number(discountPrice) : Number(plan.price);

    let actualPrice = basePrice;
    let discountPercentApplied = 0;

    if (plan.category?.startsWith("medal_")) {
      if (userId) {
        const { data: allUserPaid } = await supabase
          .from("orders")
          .select("product_name")
          .eq("user_id", userId)
          .in("status", ["paid", "completed"]);
        
        const existingMedal = allUserPaid?.find(o => o.product_name?.toLowerCase().includes("medal"));

        if (existingMedal) {
          return res.status(400).json({ success: false, error: "You have already purchased a medal." });
        }
      }

      const { data: allSold } = await supabase
        .from("orders")
        .select("product_name")
        .in("status", ["paid", "completed"]);
      const count = allSold?.filter(o => o.product_name?.toLowerCase().includes("medal")).length || 0;
      if (count && count >= 160) {
        return res.status(400).json({ success: false, error: "SOLD OUT! The Plugsy Discount Medal has reached its 160-user limit." });
      }
    } else if (userId) {
      const activeMedal = await getUserActiveMedal(supabase, userId);
      if (activeMedal) {
        discountPercentApplied = activeMedal.discount;
        actualPrice = Math.round(basePrice * (1 - discountPercentApplied));
      }
    }

    const finalAmount = actualPrice;

    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });

    const reference = "plugsy_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const callback_url = siteUrl + "/payment/callback";

    const metadata = {
      userId: userId || null,
      userEmail: userEmail || null,
      fullName: fullName || null,
      planId: planId || null,
      productName: plan.name || plan.durationLabel || "Plugsy Plan",
      planCategory: plan.category || null,
      planDuration: plan.durationLabel || null,
      planMonths: plan.duration_months || null,
      amount: finalAmount,
      originalPrice: plan.price,
      discountedPrice: hasValidDiscount || discountPercentApplied > 0 ? actualPrice : null,
      purchaseCodeUsed: purchaseCodeUsed || null,
      purchaseCodeOwnerId: purchaseCodeOwnerId || null,
      purchaseCodeOwnerName: purchaseCodeOwnerName || null,
      // Flatten categories to comma‑separated string
      categories: Array.isArray(plan.categories) ? plan.categories.join(",") : "",
      category: plan.category || null,
      type: plan.category && plan.category.startsWith("portfolio") ? "portfolio_purchase" : "capcut_order"
    };

    console.log("[init] metadata:", JSON.stringify(metadata));

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + flwKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount: finalAmount,
        currency: "NGN",
        redirect_url: callback_url,
        customer: {
          email: userEmail,
          name: fullName || userEmail.split("@")[0]
        },
        customizations: {
          title: "Plugsy",
          description: plan.name || "Plugsy Order"
        },
        meta: metadata
      })
    });

    const flwData = await flwRes.json();
    console.log("[init] Flutterwave response:", flwData);

    if (flwData.status !== "success" || !flwData.data?.link) {
      return res.status(400).json({ success: false, error: "Flutterwave error: " + (flwData.message || "Failed to initialize payment") });
    }

    return res.status(200).json({
      success: true,
      authorization_url: flwData.data.link,
      reference: reference
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Server crash: " + e.message });
  }
}

async function handleVerify(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  try {
    const rawBody = await readBody(req);
    const { reference } = JSON.parse(rawBody);
    if (!reference) return res.status(400).json({ success: false, error: "Missing reference" });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey || !flwKey) return res.status(500).json({ success: false, error: "Missing Env Vars" });

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check database first!
    const { data: existingOrder } = await supabase.from("orders").select("*").eq("paystack_ref", reference).maybeSingle();
    
    if (existingOrder) {
      console.log("[verify] Found existing order for reference:", reference);
      return res.status(200).json({ success: true, alreadyProcessed: true, order: existingOrder });
    }

    if (reference.startsWith("wallet_pay_")) {
      return res.status(404).json({ success: false, error: "Wallet order not found. If your balance was deducted, please refresh in a moment." });
    }

    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${flwKey}` }
    });
    const flwData = await flwRes.json();

    if (flwData?.status !== "success" || flwData?.data?.status !== "successful") {
      return res.status(400).json({ success: false, error: "Payment not successful in Flutterwave" });
    }

    return res.status(200).json({ success: true, alreadyProcessed: false, message: "Payment verified, webhook will process shortly" });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handlePortfolioWebhook(event, res) {
  try {
    const rawMeta = event.data?.metadata || {};
    console.log("[portfolio-webhook] ===== PORTFOLIO PURCHASE =====");
    console.log("[portfolio-webhook] reference:", event.data?.reference);
    console.log("[portfolio-webhook] amount:", event.data?.amount);
    console.log("[portfolio-webhook] customer:", JSON.stringify(event.data?.customer));
    console.log("[portfolio-webhook] full raw metadata:", JSON.stringify(event.data?.metadata));
    console.log("[portfolio-webhook] service key exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    const reference = event.data?.reference;
    const userId = rawMeta.userId || null;
    const userEmail = rawMeta.userEmail || event.data?.customer?.email || null;
    const fullName = rawMeta.fullName || null;
    const category = rawMeta.category || null;
    const categories = rawMeta.categories ? JSON.parse(rawMeta.categories) : (rawMeta.categories || [category]);
    const purchaseCodeUsed = rawMeta.purchaseCodeUsed || null;
    const purchaseCodeOwnerId = rawMeta.purchaseCodeOwnerId || null;
    const purchaseCodeOwnerName = rawMeta.purchaseCodeOwnerName || null;

    console.log("[payments-webhook -> portfolio] processing for:", userEmail, category);

    console.log("URL:", process.env.VITE_SUPABASE_URL);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for duplicate in vp_portfolios (Portfolio payments NEVER touch orders table)
    const { data: existing } = await supabase
      .from("vp_portfolios")
      .select("id")
      .eq("paystack_ref", reference)
      .maybeSingle();

    if (existing) {
      console.log("[payments-webhook -> portfolio] duplicate, skipping");
      return res.status(200).json({ received: true });
    }

    // Generate unique slug
    const baseSlug = (fullName || userEmail || "portfolio")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    let slug = baseSlug + "-" + Math.random().toString(36).slice(2, 6);

    // Make sure slug is unique
    const { data: slugExists } = await supabase
      .from("vp_portfolios")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (slugExists) {
      slug = baseSlug + "-" + Date.now().toString(36);
    }

     // Look for an existing draft portfolio for this user to avoid duplication
    let existingDraft = null;
    if (userId) {
      const { data: draft } = await supabase
        .from("vp_portfolios")
        .select("id, slug")
        .eq("user_id", userId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingDraft = draft;
    }
    if (!existingDraft && userEmail) {
      const { data: draft } = await supabase
        .from("vp_portfolios")
        .select("id, slug")
        .eq("user_email", userEmail)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingDraft = draft;
    }

    let portfolio = null;
    let portfolioErr = null;

    if (existingDraft) {
      console.log("[payments-webhook -> portfolio] existing draft found, activating:", existingDraft.id);
      const { data: updated, error } = await supabase
        .from("vp_portfolios")
        .update({
          category: category,
          categories: categories,
          full_name: fullName || undefined,
          status: "active",
          is_paid: true,
          paystack_ref: reference,
          // Preserve their existing slug if it exists
          slug: existingDraft.slug || slug
        })
        .eq("id", existingDraft.id)
        .select()
        .maybeSingle();
      portfolio = updated;
      portfolioErr = error;
      
      // Clean up any other stale drafts for this user to prevent them from getting multiple portfolios in the UI
      if (userId) {
         await supabase.from("vp_portfolios").delete().eq("user_id", userId).eq("status", "draft");
      } else if (userEmail) {
         await supabase.from("vp_portfolios").delete().eq("user_email", userEmail).eq("status", "draft");
      }
    } else {
      console.log("[payments-webhook -> portfolio] no existing draft found, creating new");
      const { data: inserted, error } = await supabase
        .from("vp_portfolios")
        .insert({
          user_id: userId,
          user_email: userEmail,
          category: category,
          categories: categories,
          full_name: fullName,
          status: "active",
          is_paid: true,
          paystack_ref: reference,
          slug: slug,
          color_theme: "classic",
          font_pairing: "refined_editorial"
        })
        .select()
        .maybeSingle();
      portfolio = inserted;
      portfolioErr = error;
    }

    console.log("[payments-webhook -> portfolio] portfolio created:", portfolio?.id, portfolioErr);

    if (portfolioErr) {
      console.error("[payments-webhook -> portfolio] portfolio error:", portfolioErr.message);
      return res.status(500).json({ error: portfolioErr.message });
    }

    // Record in portfolio_purchases table (bulletproof insert with detailed logging)
    const purchaseAmount = event.data?.amount / 100 || 0;
    const purchaseRef = event.data?.reference || reference;

    console.log("[portfolio-webhook] inserting purchase record:", {
      user_email: userEmail,
      category: category,
      amount: purchaseAmount,
      paystack_ref: purchaseRef
    });

    const { data: purchaseRecord, error: purchaseError } = await supabase
      .from("portfolio_purchases")
      .insert({
        user_id: userId || null,
        user_email: userEmail || null,
        user_name: fullName || null,
        category: category || null,
        amount: purchaseAmount,
        paystack_ref: purchaseRef,
        purchase_code_used: purchaseCodeUsed || null,
        purchase_code_owner_id: purchaseCodeOwnerId || null,
        reward_amount: 0,
        reward_status: "none",
        created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    console.log("[portfolio-webhook] purchase record insert:", purchaseRecord, purchaseError);

    if (purchaseError) {
      console.error("[portfolio-webhook] PURCHASE INSERT FAILED:", 
        purchaseError.message, purchaseError.code);
      // Do not return error - continue with other operations
    }

    // Process referral reward (bulletproof section)
    console.log("[portfolio-webhook] purchaseCodeOwnerId:", purchaseCodeOwnerId);

    if (purchaseCodeOwnerId && purchaseCodeOwnerId.trim() !== "") {
      try {
        const CATEGORY_PRICES = {
          graphic_design: 1200,
          video_editing: 1500,
          web_development: 1200,
          uiux_design: 1450,
          copywriting: 1400,
          digital_marketing: 1000,
          photography: 2400,
          ai_automation: 2200,
          cybersecurity: 1800,
          three_d_design: 2400
        };

        const categoryPrice = CATEGORY_PRICES[category] || purchaseAmount;
        let rewardPercent = 0.10;
        let ownerMedal = null;

        // Check if owner has a medal
        const { data: medalStatus } = await supabase
          .from("orders")
          .select("product_name")
          .eq("user_id", purchaseCodeOwnerId)
          .in("status", ["paid", "completed"])
          .order("created_at", { ascending: false });

        if (medalStatus && medalStatus.length > 0) {
          for (const order of medalStatus) {
            const name = order.product_name?.toLowerCase() || "";
            if (name.includes("gold") || name.includes("20k")) {
              ownerMedal = { bonus: 0.20 };
              break;
            }
            if (name.includes("silver") || name.includes("15k")) {
              ownerMedal = { bonus: 0.15 };
              break;
            }
            if (name.includes("bronze") || name.includes("8k")) {
              ownerMedal = { bonus: 0.10 };
              break;
            }
          }
        }

        const reward = Math.round(categoryPrice * rewardPercent);
        
        console.log("[portfolio-webhook] calculating reward:", {
          category,
          categoryPrice,
          rewardPercent,
          reward,
          ownerId: purchaseCodeOwnerId,
          hasMedal: !!ownerMedal
        });

        // Fetch owner profile (Support both clerk_id and UUID)
        let ownerProfile = null;
        let ownerFetchError = null;

        // Try clerk_id first
        const { data: byClerkId, error: errClerk } = await supabase
          .from("profiles")
          .select("clerk_id, id, balance, total_referral_earnings, referral_count, email, full_name")
          .eq("clerk_id", purchaseCodeOwnerId)
          .maybeSingle();

        if (byClerkId) {
          ownerProfile = byClerkId;
          console.log("[portfolio-webhook] found owner by clerk_id:", purchaseCodeOwnerId);
        } else {
          ownerFetchError = errClerk;
        }

        // Try id (UUID) if clerk_id not resolved
        if (!ownerProfile) {
          const { data: byId, error: errId } = await supabase
            .from("profiles")
            .select("clerk_id, id, balance, total_referral_earnings, referral_count, email, full_name")
            .eq("id", purchaseCodeOwnerId)
            .maybeSingle();
          
          if (byId) {
            ownerProfile = byId;
            console.log("[portfolio-webhook] found owner by id (UUID):", purchaseCodeOwnerId);
            ownerFetchError = null;
          } else if (errId) {
            ownerFetchError = errId;
          }
        }

        console.log("[portfolio-webhook] referral owner resolved:", ownerProfile, ownerFetchError);

        if (ownerFetchError || !ownerProfile) {
          console.error("[portfolio-webhook] OWNER NOT FOUND:", 
            purchaseCodeOwnerId, ownerFetchError?.message);
        } else {
          const newBalance = (Number(ownerProfile.balance) || 0) + reward;
          const newEarnings = (Number(ownerProfile.total_referral_earnings) || 0) + reward;
          const newCount = (Number(ownerProfile.referral_count) || 0) + 1;

          console.log("[portfolio-webhook] updating owner balance:", {
            oldBalance: ownerProfile.balance,
            newBalance,
            reward
          });

          // Update using clerk_id if available, fallback to id
          const updateKeyColumn = ownerProfile.clerk_id ? "clerk_id" : "id";
          const updateKeyValue = ownerProfile.clerk_id || ownerProfile.id || purchaseCodeOwnerId;

          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              balance: newBalance,
              total_referral_earnings: newEarnings,
              referral_count: newCount
            })
            .eq(updateKeyColumn, updateKeyValue);

          console.log("[portfolio-webhook] referral update result:", updateError);

          if (updateError) {
            console.error("[portfolio-webhook] BALANCE UPDATE FAILED:", 
              updateError.message);
          } else {
            console.log("[portfolio-webhook] ✅ balance updated to:", newBalance);

            // Update purchase record with reward info
            await supabase
              .from("portfolio_purchases")
              .update({ 
                reward_amount: reward, 
                reward_status: "paid" 
              })
              .eq("paystack_ref", purchaseRef);

            // Send notification to code owner via messages table
            const recipientUserId = ownerProfile.clerk_id || ownerProfile.id || purchaseCodeOwnerId;
            const { error: msgError } = await supabase
              .from("messages")
              .insert({
                sender_id: "system",
                sender_role: "system",
                sender_name: "Plugsy",
                content: "🎉 You earned ₦" + reward.toLocaleString() +
                         " referral commission! Someone used your code " +
                         (purchaseCodeUsed || "") +
                         " to purchase a " + (category || "portfolio") +
                         " portfolio. Your new balance is ₦" +
                         newBalance.toLocaleString() + ".",
                user_id: recipientUserId,
                event: "reward",
                topic: "referral",
                is_from_user: false,
                is_bot: true,
                is_bot_message: true,
                read_by_admin: true,
                read_by_user: false
              });

            console.log("[portfolio-webhook] message insert result:", msgError);
            console.log("[portfolio-webhook] ✅ referral complete:", reward);
          }
        }
      } catch (referralError) {
        console.error("[portfolio-webhook] referral crash:", referralError.message);
      }
    }

    // Send Telegram notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (telegramToken && telegramChatId) {
      const msg = 
        "🎨 NEW PORTFOLIO PURCHASE — PLUGSY\n\n" +
        "👤 " + (fullName || userEmail || "Unknown") + "\n" +
        "📧 " + (userEmail || "Unknown") + "\n" +
        "🗂 Category: " + (category || "Unknown") + "\n" +
        "💰 ₦" + (event.data.amount / 100).toLocaleString() + "\n" +
        "🎟 Code: " + (purchaseCodeUsed || "None") + "\n\n" +
        "👉 https://www.plugsy.ng/admin/portfolio-sales";

      await fetch(
        "https://api.telegram.org/bot" + telegramToken + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: msg
          })
        }
      ).catch(e => console.error("[payments-webhook -> portfolio] telegram:", e.message));
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("[payments-webhook -> portfolio] crash:", e.message);
    return res.status(200).json({ received: true });
  }
}

async function handleWebhook(req, res) {
  console.log("[webhook] ========= FLUTTERWAVE WEBHOOK HIT =========")
  console.log("[webhook] headers:", JSON.stringify(req.headers))

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const rawBody = await readBody(req);
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;
    const headerHash = req.headers["verif-hash"];

    if (secretHash && headerHash && headerHash !== secretHash) {
      console.log("[webhook] Invalid verif-hash:", headerHash);
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    console.log("[webhook] event object:", JSON.stringify(event));

    const eventName = event.event || event["event.type"] || "";
    const eventData = event.data || {};
    const reference = eventData.tx_ref || eventData.reference || eventData.flw_ref;

    // Handle Transfer Webhooks
    if (eventName === "transfer.completed") {
      console.log("[webhook] transfer event detected:", eventName, "status:", eventData.status);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const isTransferSuccess = eventData.status === "SUCCESSFUL";

      if (isTransferSuccess) {
        await supabase
          .from("wallet_transactions")
          .update({ status: "success", updated_at: new Date().toISOString() })
          .eq("reference", reference);

        const { data: tx } = await supabase
          .from("wallet_transactions")
          .select("user_id, amount")
          .eq("reference", reference)
          .maybeSingle();

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
            .eq("status", "pending");

          await supabase.from("messages").insert({
            sender_id: "system",
            sender_role: "system",
            sender_name: "Plugsy",
            content: "✅ Your withdrawal of ₦" + tx.amount.toLocaleString() +
              " has been sent to your bank account via Flutterwave.",
            user_id: tx.user_id,
            event: "withdrawal_success",
            topic: "wallet",
            is_from_user: false,
            is_bot: true,
            is_bot_message: true,
            read_by_admin: true,
            read_by_user: false
          });
        }
      } else {
        const { data: tx } = await supabase
          .from("wallet_transactions")
          .select("user_id, user_email, amount, fee, balance_before")
          .eq("reference", reference)
          .maybeSingle();

        if (tx) {
          await supabase
            .from("withdrawals")
            .update({
              status: "failed",
              admin_note: "Flutterwave transfer failed: " + (eventData.complete_message || "Transfer error")
            })
            .eq("user_id", tx.user_id)
            .eq("amount", tx.amount)
            .eq("status", "pending");

          const { data: profile } = await supabase
            .from("profiles")
            .select("balance")
            .eq("clerk_id", tx.user_id)
            .maybeSingle();

          const refundedBalance = (profile?.balance || 0) + tx.amount + tx.fee;

          await supabase
            .from("profiles")
            .update({ balance: refundedBalance })
            .eq("clerk_id", tx.user_id);

          await supabase
            .from("wallet_transactions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("reference", reference);

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
          });
        }
      }

      return res.status(200).json({ received: true });
    }

    if (eventName !== "charge.completed" && eventData.status !== "successful") {
      console.log("[webhook] Ignoring non-successful charge event:", eventName, eventData.status);
      return res.status(200).json({ received: true });
    }

    const meta = eventData.meta || eventData.metadata || event.meta || {};
    const metaType = meta.type;
    console.log("[payments-webhook] metadata type:", metaType);

    if (metaType === "wallet_funding") {
      console.log("[payments-webhook] wallet funding detected, routing");
      const amount = Number(eventData.amount);
      const userId = meta.userId;

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: existingTx } = await supabase
        .from("wallet_transactions")
        .select("id, status")
        .eq("reference", reference)
        .maybeSingle();

      if (existingTx?.status === "success") {
        console.log("[wallet-fund-webhook] already processed");
        return res.status(200).json({ received: true });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("clerk_id", userId)
        .single();

      const balanceBefore = profile?.balance || 0;
      const balanceAfter = balanceBefore + amount;

      await supabase
        .from("profiles")
        .update({ balance: balanceAfter })
        .eq("clerk_id", userId);

      await supabase
        .from("wallet_transactions")
        .update({
          status: "success",
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          updated_at: new Date().toISOString()
        })
        .eq("reference", reference);

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
      });

      console.log("[wallet-fund-webhook] ✅ complete");
      return res.status(200).json({ received: true });
    }

    if (metaType === "portfolio_purchase") {
      console.log("[payments-webhook] routing to portfolio handler");
      return handlePortfolioWebhook(event, res);
    }

    console.log("[webhook] Processing plan order for reference:", reference);
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existingOrder } = await supabase.from("orders").select("id").eq("paystack_ref", reference).maybeSingle();
    if (existingOrder) {
      console.log("[webhook] Duplicate order found, skipping.");
      return res.status(200).json({ received: true });
    }

    const rawMeta = meta;
    const userId = rawMeta.userId || rawMeta.user_id || null;
    const userEmail = rawMeta.userEmail || rawMeta.user_email || eventData.customer?.email || null;
    const fullName = rawMeta.fullName || rawMeta.full_name || eventData.customer?.name || null;
    const productName = rawMeta.productName || rawMeta.product_name || rawMeta.planName || rawMeta.plan_name || "Plugsy Plan";
    const planCategory = rawMeta.planCategory || rawMeta.plan_category || null;
    const planDuration = rawMeta.planDuration || rawMeta.plan_duration || null;
    const planMonths = Number(rawMeta.planMonths || rawMeta.plan_months || 1);
    const purchaseCodeUsed = rawMeta.purchaseCodeUsed || rawMeta.purchase_code_used || null;
    const purchaseCodeOwnerId = rawMeta.purchaseCodeOwnerId || rawMeta.purchase_code_owner_id || null;

    const isMedal = planCategory?.startsWith("medal_") || productName?.toLowerCase().includes("medal");
    const order_reference = "REQ-" + Math.random().toString(36).toUpperCase().slice(2, 10);
    const amountPaid = Number(eventData.amount);

    if (userId) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_id", userId)
        .maybeSingle();

      if (!existingProfile) {
        await supabase
          .from("profiles")
          .insert({
            clerk_id: userId,
            email: userEmail || "",
            full_name: fullName || userEmail?.split("@")[0] || "Plugsy User",
            balance: 0,
            role: "user",
            updated_at: new Date().toISOString()
          });
      }
    }

    const { data: insertedOrder, error: insertError } = await supabase.from("orders").insert({
      user_id: userId, user_email: userEmail, product_name: productName, plan_duration: planDuration,
      plan_months: planMonths, plan_duration_days: planMonths * 30, amount: amountPaid, currency: "NGN",
      order_reference: order_reference, paystack_ref: reference, status: "paid", delivery_status: isMedal ? "delivered" : (metaType === "portfolio_purchase" ? "delivered" : "pending_login"),
      purchase_code_used: purchaseCodeUsed, purchase_code_owner_id: purchaseCodeOwnerId, reward_amount: 0, reward_status: "none"
    }).select().single();

    if (insertError || !insertedOrder) {
      console.log("[webhook] Error inserting order:", insertError);
      return res.status(500).json({ error: "Failed to create order" });
    }

    // Sync medal to profile if this was a medal purchase
    if (isMedal && userId) {
      console.log("[webhook] Medal purchase detected, activating benefits for:", userId);
      const searchStr = (planCategory || productName || "").toLowerCase();
      const medalTier = searchStr.includes("gold") || searchStr.includes("20k") ? "Gold" : 
                        searchStr.includes("silver") || searchStr.includes("15k") ? "Silver" : "Bronze";
      let medalNumber = await getUserMedalNumber(supabase, userId);
      
      if (!medalNumber) {
        const { data: allPaid } = await supabase
          .from("orders")
          .select("product_name")
          .in("status", ["paid", "completed"]);
        medalNumber = (allPaid?.filter(o => o.product_name?.toLowerCase().includes("medal") || o.product_name?.includes("8k") || o.product_name?.includes("15k") || o.product_name?.includes("20k")).length) || 1;
      }

      console.log("[webhook] Activating medal:", { medalTier, medalNumber });
      
      // Ensure profile exists before updating
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_id", userId)
        .maybeSingle();

      let profileUpdateError;
      if (!existingProfile) {
        console.log("[webhook] Profile missing for medal holder, creating now...");
        const { error } = await supabase
          .from("profiles")
          .insert({
            clerk_id: userId,
            email: userEmail,
            full_name: fullName,
            medal_tier: medalTier,
            medal_number: medalNumber,
            balance: 0,
            role: 'user'
          });
        profileUpdateError = error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({
            medal_tier: medalTier,
            medal_number: medalNumber
          })
          .eq("clerk_id", userId);
        profileUpdateError = error;
      }
      
      if (profileUpdateError) {
        console.error("[webhook] Profile medal activation FAILED:", profileUpdateError.message);
      } else {
        console.log("[webhook] ✅ Profile medal activated successfully");
      }
    }

    console.log("[webhook] Order created successfully. ID:", insertedOrder.id);

    try {
      const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;
      if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
        const telegramMessage = "🔔 NEW PAYMENT — PLUGSY\n\n👤 " + (fullName || userEmail) + "\n📧 " + userEmail + "\n📦 " + productName + "\n💰 ₦" + amountPaid.toLocaleString() + "\n🎟 Code: " + (purchaseCodeUsed || "None") + "\n🔑 Ref: " + insertedOrder.order_reference + "\n\n👉 https://www.plugsy.ng/admin";
        await fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: telegramMessage })
        });
      }
    } catch (e) {}

    if (!userId && userEmail) {
      const { data: profile } = await supabase.from("profiles").select("clerk_id").eq("email", userEmail).single();
      if (profile?.clerk_id) await supabase.from("orders").update({ user_id: profile.clerk_id }).eq("id", insertedOrder.id);
    }

    const { data: existingChat } = await supabase.from("chats").select("id").eq("user_email", userEmail).limit(1).maybeSingle();
    let chatId = existingChat?.id;
    if (!chatId) {
      const { data: newChat } = await supabase.from("chats").insert({
        user_id: userId, order_id: insertedOrder.id, user_email: userEmail, status: "active",
        needs_admin_attention: true, last_message: "Payment confirmed - awaiting login", last_message_at: new Date().toISOString()
      }).select().single();
      chatId = newChat?.id;
    }

    await supabase.from("messages").insert({
      sender_id: "system", sender_role: "system", sender_name: "Plugsy",
      content: "✅ Payment Confirmed! We received your payment of ₦" + amountPaid.toLocaleString() + " for " + productName + ". " + (productName?.toLowerCase().includes("medal") ? "Your lifetime benefits have been activated immediately! Check your profile to see your new medal badge. 🚀" : "Our team is preparing your login details and will send them shortly. Thank you for choosing Plugsy! 🚀"),
      user_id: userId, user_email: userEmail, order_id: insertedOrder.id, chat_id: chatId,
      event: "payment_confirmed", topic: "payment", is_from_user: false, is_bot: true, is_bot_message: true, read_by_admin: true, read_by_user: false
    });

    if (purchaseCodeOwnerId) {
      const ownerMedal = await getUserActiveMedal(supabase, purchaseCodeOwnerId);
      let rewardPercent = 0.10;
      if (ownerMedal) {
        rewardPercent += ownerMedal.commissionBonus;
      }
      const reward = Math.round(amountPaid * rewardPercent);
      const { data: ownerProfile } = await supabase.from("profiles").select("balance, total_referral_earnings, referral_count").eq("clerk_id", purchaseCodeOwnerId).single();
      if (ownerProfile) {
        await supabase.from("profiles").update({ balance: (ownerProfile.balance || 0) + reward, total_referral_earnings: (ownerProfile.total_referral_earnings || 0) + reward, referral_count: (ownerProfile.referral_count || 0) + 1 }).eq("clerk_id", purchaseCodeOwnerId);
        await supabase.from("orders").update({ reward_amount: reward, reward_status: "paid" }).eq("id", insertedOrder.id);
        await supabase.from("messages").insert({
          sender_id: "system", sender_role: "system", sender_name: "Plugsy", content: "🎉 You earned ₦" + reward.toLocaleString() + " commission! Someone used your code " + purchaseCodeUsed + " to buy a plan." + (ownerMedal ? " (Medal Boost Applied! 🚀)" : ""), user_id: purchaseCodeOwnerId, event: "reward", topic: "referral", is_from_user: false, is_bot: true, is_bot_message: true, read_by_admin: true, read_by_user: false
        });
      }
    }

    if (userId) {
      console.log("[webhook] Cleaning up remaining drafts for user:", userId);
      await supabase.from("vp_portfolios").delete().eq("user_id", userId).eq("status", "draft");
    }

    console.log("[webhook] ========= WEBHOOK SUCCESSFULLY PROCESSED =========");
    return res.status(200).json({ received: true });
  } catch (err) {
    console.log("[webhook] CRASH ERROR:", err);
    return res.status(500).json({ error: "Webhook error" });
  }
}

async function handleCreateFromWallet(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody);

    const {
      userId, userEmail, fullName, productName, planCategory, planDuration, planMonths,
      amountPaid, purchaseCodeUsed, purchaseCodeOwnerId, reference
    } = body;

    console.log("URL:", process.env.VITE_SUPABASE_URL);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isMedal = planCategory?.startsWith("medal_") || productName?.toLowerCase().includes("medal");

    if (isMedal) {
      const { data: allSold } = await supabase
        .from("orders")
        .select("product_name")
        .in("status", ["paid", "completed"]);
      // Fallback check since orders don't store category
      const count = allSold?.filter(o => o.product_name?.toLowerCase().includes("medal") || o.product_name?.includes("8k") || o.product_name?.includes("15k") || o.product_name?.includes("20k")).length || 0;
      
      if (count && count >= 160) {
        return res.status(400).json({ success: false, error: "SOLD OUT! The Plugsy Discount Medal has reached its 160-user limit." });
      }

      if (userId) {
        const { data: allUserPaid } = await supabase
          .from("orders")
          .select("product_name")
          .eq("user_id", userId)
          .in("status", ["paid", "completed"]);
        
        const existingMedal = allUserPaid?.find(o => o.product_name?.toLowerCase().includes("medal") || o.product_name?.includes("8k") || o.product_name?.includes("15k") || o.product_name?.includes("20k"));

        if (existingMedal) {
          return res.status(400).json({ success: false, error: "You already own a medal. You can only own one medal license." });
        }
      }
    }

    const order_reference = "REQ-" + Math.random().toString(36).toUpperCase().slice(2, 10);
    console.log("[wallet-create] Creating order...", { userId, userEmail, productName, amountPaid });

    const { data: insertedOrder, error: insertError } = await supabase.from("orders").insert({
      user_id: userId, user_email: userEmail, product_name: productName, plan_duration: planDuration,
      plan_months: planMonths, plan_duration_days: planMonths * 30, amount: amountPaid, currency: "NGN",
      order_reference: order_reference, paystack_ref: reference, status: "paid", delivery_status: isMedal ? "delivered" : "pending_login",
      purchase_code_used: purchaseCodeUsed, purchase_code_owner_id: purchaseCodeOwnerId, reward_amount: 0, reward_status: "none"
    }).select().single();

    if (insertError || !insertedOrder) {
       console.log("[wallet-create] Error inserting order:", insertError);
       return res.status(500).json({ error: "Failed to create order" });
    }

    // Sync medal to profile if this was a medal purchase
    if (isMedal && userId) {
      console.log("[wallet-create] Medal purchase detected, activating benefits for:", userId);
      const searchStr = (planCategory || productName || "").toLowerCase();
      const medalTier = searchStr.includes("gold") || searchStr.includes("20k") ? "Gold" : 
                        searchStr.includes("silver") || searchStr.includes("15k") ? "Silver" : "Bronze";
      let medalNumber = await getUserMedalNumber(supabase, userId);
      
      if (!medalNumber) {
        const { data: allPaid } = await supabase
          .from("orders")
          .select("product_name")
          .in("status", ["paid", "completed"]);
        medalNumber = (allPaid?.filter(o => o.product_name?.toLowerCase().includes("medal") || o.product_name?.includes("8k") || o.product_name?.includes("15k") || o.product_name?.includes("20k")).length) || 1;
      }

      console.log("[wallet-create] Activating medal:", { medalTier, medalNumber });

      // Ensure profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_id", userId)
        .maybeSingle();

      let profileUpdateError;
      if (!existingProfile) {
        console.log("[wallet-create] Profile missing for medal holder, creating now...");
        const { error } = await supabase
          .from("profiles")
          .insert({
            clerk_id: userId,
            email: userEmail,
            full_name: fullName,
            medal_tier: medalTier,
            medal_number: medalNumber,
            balance: 0,
            role: 'user'
          });
        profileUpdateError = error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({
            medal_tier: medalTier,
            medal_number: medalNumber
          })
          .eq("clerk_id", userId);
        profileUpdateError = error;
      }

      if (profileUpdateError) {
        console.error("[wallet-create] Profile medal activation FAILED:", profileUpdateError.message);
      } else {
        console.log("[wallet-create] ✅ Profile medal activated successfully");
      }
    }

    try {
      const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;
      if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
        const telegramMessage = "💰 NEW WALLET PAYMENT — PLUGSY\n\n👤 " + (fullName || userEmail) + "\n📧 " + userEmail + "\n📦 " + productName + "\n💰 ₦" + amountPaid.toLocaleString() + "\n🎟 Code: " + (purchaseCodeUsed || "None") + "\n🔑 Ref: " + insertedOrder.order_reference + "\n\n👉 https://www.plugsy.ng/admin";
        await fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: telegramMessage })
        });
      }
    } catch (e) {}

    const { data: existingChat } = await supabase.from("chats").select("id").eq("user_email", userEmail).limit(1).maybeSingle();
    let chatId = existingChat?.id;
    if (!chatId) {
      const { data: newChat } = await supabase.from("chats").insert({
        user_id: userId, order_id: insertedOrder.id, user_email: userEmail, status: "active",
        needs_admin_attention: true, last_message: "Payment confirmed via Wallet - awaiting login", last_message_at: new Date().toISOString()
      }).select().single();
      chatId = newChat?.id;
    }

    await supabase.from("messages").insert({
      sender_id: "system", sender_role: "system", sender_name: "Plugsy",
      content: "✅ Payment Confirmed via Wallet! We received your payment of ₦" + amountPaid.toLocaleString() + " for " + productName + ". " + (productName?.toLowerCase().includes("medal") ? "Your lifetime benefits have been activated immediately! Check your profile to see your new medal badge. 🚀" : "Our team is preparing your login details and will send them shortly. Thank you for choosing Plugsy! 🚀"),
      user_id: userId, user_email: userEmail, order_id: insertedOrder.id, chat_id: chatId,
      event: "payment_confirmed", topic: "payment", is_from_user: false, is_bot: true, is_bot_message: true, read_by_admin: true, read_by_user: false
    });

    if (purchaseCodeOwnerId) {
      const ownerMedal = await getUserActiveMedal(supabase, purchaseCodeOwnerId);
      let rewardPercent = 0.10;
      if (ownerMedal) {
        rewardPercent += ownerMedal.commissionBonus;
      }
      const reward = Math.round(amountPaid * rewardPercent);
      const { data: ownerProfile } = await supabase.from("profiles").select("balance, total_referral_earnings, referral_count").eq("clerk_id", purchaseCodeOwnerId).single();
      if (ownerProfile) {
        await supabase.from("profiles").update({ balance: (ownerProfile.balance || 0) + reward, total_referral_earnings: (ownerProfile.total_referral_earnings || 0) + reward, referral_count: (ownerProfile.referral_count || 0) + 1 }).eq("clerk_id", purchaseCodeOwnerId);
        await supabase.from("orders").update({ reward_amount: reward, reward_status: "paid" }).eq("id", insertedOrder.id);
        await supabase.from("messages").insert({
          sender_id: "system", sender_role: "system", sender_name: "Plugsy", content: "🎉 You earned ₦" + reward.toLocaleString() + " commission! Someone used your code " + purchaseCodeUsed + " to buy a plan." + (ownerMedal ? " (Medal Boost Applied! 🚀)" : ""), user_id: purchaseCodeOwnerId, event: "reward", topic: "referral", is_from_user: false, is_bot: true, is_bot_message: true, read_by_admin: true, read_by_user: false
        });
      }
    }

    if (userId) {
      await supabase.from("vp_portfolios").delete().eq("user_id", userId).eq("status", "draft");
    }

    return res.status(200).json({ success: true, order: insertedOrder });
  } catch (err) {
    console.log("[wallet-create] CRASH ERROR:", err);
    return res.status(500).json({ error: "Create error" });
  }
}

export default async function handler(req, res) {
  console.log("[payments] ========= REQUEST RECEIVED =========")
  console.log("[payments] method:", req.method)
  console.log("[payments] url:", req.url)
  console.log("[payments] query:", JSON.stringify(req.query || {}))
  const rawQueryAction = req.query?.action;
  console.log("[payments] action:", rawQueryAction)

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-paystack-signature");
  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];
  console.log("[payments] resolved action:", action);

  if (action === "initialize") return await handleInitialize(req, res);
  if (action === "verify") return await handleVerify(req, res);
  if (action === "webhook") return await handleWebhook(req, res);
  if (action === "create-from-wallet") return await handleCreateFromWallet(req, res);

  if (action === "get-medal-status") {
    try {
      const userId = req.query?.userId || req.body?.userId;
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      console.log("URL:", process.env.VITE_SUPABASE_URL);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const medal = await getUserActiveMedal(supabase, userId);
      const medalNumber = await getUserMedalNumber(supabase, userId);
      
      const { data: allPaidOrders } = await supabase
        .from("orders")
        .select("product_name")
        .in("status", ["paid", "completed"]);
      
      const totalSold = allPaidOrders?.filter(o => o.product_name?.toLowerCase().includes("medal")).length || 0;

      return res.status(200).json({ success: true, medal, medalNumber, totalSold });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(404).json({ error: "Unknown action: " + action });
}
