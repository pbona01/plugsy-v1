import { createClient } from "@supabase/supabase-js"
import crypto from "crypto";
import { CATEGORY_CONFIG, getCategoryConfig } from "../src/utils/categoryConfig.js";
import { getPortfolioInitializationPause } from "./_portfolioPurchasePause.js";

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

async function handleDeleteItem(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const { id } = req.body || JSON.parse(req.body)
    if (!id) return res.status(400).json({ error: "Missing id" })
    
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const { error } = await supabase.from("vp_portfolio_items").delete().eq("id", id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

async function handlePurchase(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody);

    const {
      userId,
      userEmail,
      fullName,
      category,
      categories,
      purchaseCodeUsed,
      purchaseCodeOwnerId,
      purchaseCodeOwnerName
    } = body;

    console.log("[portfolio-purchase] body:", body)

    if (!userEmail) {
      return res.status(400).json({ 
        success: false, error: "Missing userEmail" 
      })
    }
    if (!category) {
      return res.status(400).json({ 
        success: false, error: "Missing category" 
      })
    }

    const config = getCategoryConfig(category);
    let price = config?.price || 1000;
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (userId) {
      const activeMedal = await getUserActiveMedal(supabase, userId);
      if (activeMedal) {
        price = Math.round(price * (1 - activeMedal.discount));
        console.log("[portfolio-purchase] medal discount applied. New price:", price);
      }
    }

    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.plugsy.ng"

    if (!flwKey) {
      return res.status(500).json({ 
        success: false, error: "Missing FLUTTERWAVE_SECRET_KEY" 
      })
    }

    const reference = "portfolio_" + Date.now() + "_" + 
      Math.random().toString(36).slice(2, 8)

    const callback_url = siteUrl + "/portfolio/callback"

    const metadata = {
      type: "portfolio_purchase",
      userId: userId || null,
      userEmail: userEmail,
      fullName: fullName || null,
      category: category,
      // Flatten categories to comma‑separated string
      categories: Array.isArray(categories) ? categories.join(",") : typeof categories === "string" ? categories : (Array.isArray([category]) ? [category].join(",") : ""),
      categoryPrice: price,
      purchaseCodeUsed: purchaseCodeUsed || null,
      purchaseCodeOwnerId: purchaseCodeOwnerId || null,
      purchaseCodeOwnerName: purchaseCodeOwnerName || null
    };

    console.log("[portfolio-purchase] metadata:", JSON.stringify(metadata))

    const flwRes = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + flwKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount: price,
          currency: "NGN",
          redirect_url: callback_url,
          customer: {
            email: userEmail,
            name: fullName || userEmail.split("@")[0]
          },
          customizations: {
            title: "Plugsy",
            description: "Portfolio Purchase (" + category + ")"
          },
          meta: metadata
        })
      }
    )

    const flwData = await flwRes.json()
    console.log("[portfolio-purchase] flutterwave response:", flwData)

    if (flwData.status !== "success" || !flwData.data?.link) {
      return res.status(400).json({
        success: false,
        error: "Flutterwave error: " + (flwData.message || "Failed to initialize payment")
      })
    }

    return res.status(200).json({
      success: true,
      authorization_url: flwData.data.link,
      reference: reference
    })

  } catch (e) {
    console.error("[portfolio-purchase] crash:", e.message)
    return res.status(500).json({ 
      success: false, error: e.message 
    })
  }
}

async function handleWebhook(req, res) {
  try {
    const rawBody = await readBody(req);
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_SECRET_KEY;
    const headerHash = req.headers["verif-hash"];

    if (secretHash && headerHash && headerHash !== secretHash) {
      console.log("[portfolio-webhook] invalid signature")
      return res.status(401).json({ error: "Invalid signature" })
    }

    const event = typeof req.body === "object" ? req.body : JSON.parse(rawBody);
    console.log("[portfolio-webhook] ===== PORTFOLIO PURCHASE =====");
    console.log("[portfolio-webhook] event:", event.event);

    const eventName = event.event || event["event.type"] || "";
    const eventData = event.data || {};

    if (eventName !== "charge.completed" && eventData.status !== "successful") {
      return res.status(200).json({ received: true })
    }

    const rawMeta = eventData.meta || eventData.metadata || event.meta || {}
    console.log("[portfolio-webhook] metadata:", JSON.stringify(rawMeta))

    if (rawMeta.type !== "portfolio_purchase") {
      console.log("[portfolio-webhook] not a portfolio purchase, skipping")
      return res.status(200).json({ received: true })
    }

    const reference = eventData.tx_ref || eventData.reference
    const userId = rawMeta.userId || null
    const userEmail = rawMeta.userEmail || 
                      eventData.customer?.email || null
    const fullName = rawMeta.fullName || null
    const category = rawMeta.category || null
    const categories = rawMeta.categories || [category]
    const categoryPrice = rawMeta.categoryPrice || Number(eventData.amount)
    const purchaseCodeUsed = rawMeta.purchaseCodeUsed || null
    const purchaseCodeOwnerId = rawMeta.purchaseCodeOwnerId || null
    const purchaseCodeOwnerName = rawMeta.purchaseCodeOwnerName || null

    console.log("[portfolio-webhook] processing for:", userEmail, category)

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for duplicate
    const { data: existing } = await supabase
      .from("vp_portfolios")
      .select("id")
      .eq("paystack_ref", reference)
      .maybeSingle()

    if (existing) {
      console.log("[portfolio-webhook] duplicate, skipping")
      return res.status(200).json({ received: true })
    }

    // Generate unique slug
    const baseSlug = (fullName || userEmail || "portfolio")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30)

    let slug = baseSlug + "-" + 
      Math.random().toString(36).slice(2, 6)

    // Make sure slug is unique
    const { data: slugExists } = await supabase
      .from("vp_portfolios")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()

    if (slugExists) {
      slug = baseSlug + "-" + Date.now().toString(36)
    }

    // Look for an existing draft portfolio for this user to avoid duplication
    let existingDraft = null;
    if (userId) {
      const { data: draft } = await supabase
        .from("vp_portfolios")
        .select("id, slug")
        .eq("user_id", userId)
        .eq("status", "draft")
        .maybeSingle();
      existingDraft = draft;
    }
    if (!existingDraft && userEmail) {
      const { data: draft } = await supabase
        .from("vp_portfolios")
        .select("id, slug")
        .eq("user_email", userEmail)
        .eq("status", "draft")
        .maybeSingle();
      existingDraft = draft;
    }

    let portfolio = null;
    let portfolioErr = null;

    if (existingDraft) {
      console.log("[portfolio-webhook] existing draft found, activating:", existingDraft.id);
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
    } else {
      console.log("[portfolio-webhook] no existing draft found, creating new");
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

    console.log("[portfolio-webhook] portfolio created:", 
      portfolio?.id, portfolioErr)

    if (portfolioErr) {
      console.error("[portfolio-webhook] portfolio error:", 
        portfolioErr.message)
      return res.status(500).json({ error: portfolioErr.message })
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
          .in("product_name", ["Plugsy Bronze Medal", "Plugsy Silver Medal", "Plugsy Gold Medal"])
          .order("created_at", { ascending: false });

        if (medalStatus && medalStatus.length > 0) {
          const names = medalStatus.map(o => o.product_name);
          if (names.includes("Plugsy Gold Medal")) ownerMedal = { bonus: 0.20 };
          else if (names.includes("Plugsy Silver Medal")) ownerMedal = { bonus: 0.15 };
          else if (names.includes("Plugsy Bronze Medal")) ownerMedal = { bonus: 0.10 };
          
          if (ownerMedal) {
            rewardPercent += ownerMedal.bonus;
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
                         newBalance.toLocaleString() + "." + (ownerMedal ? " (Medal Boost Applied! 🚀)" : ""),
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
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN
    const telegramChatId = process.env.TELEGRAM_CHAT_ID

    if (telegramToken && telegramChatId) {
      const msg = 
        "🎨 NEW PORTFOLIO PURCHASE — PLUGSY\n\n" +
        "👤 " + (fullName || userEmail || "Unknown") + "\n" +
        "📧 " + (userEmail || "Unknown") + "\n" +
        "🗂 Category: " + (category || "Unknown") + "\n" +
        "💰 ₦" + (event.data.amount / 100).toLocaleString() + "\n" +
        "🎟 Code: " + (purchaseCodeUsed || "None") + "\n\n" +
        "👉 https://www.plugsy.ng/admin/portfolio-sales"

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
      ).catch(e => console.error("[portfolio-webhook] telegram:", e.message))
    }

    return res.status(200).json({ received: true })

  } catch (e) {
    console.error("[portfolio-webhook] crash:", e.message)
    return res.status(200).json({ received: true })
  }
}

async function handleVerify(req, res) {
  try {
    const rawBody = await readBody(req)
    const { reference } = JSON.parse(rawBody)
    
    if (!reference) {
      return res.status(400).json({ error: "Missing reference" })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if portfolio was already created by webhook
    const { data: portfolio } = await supabase
      .from("vp_portfolios")
      .select("id, category, slug, status")
      .eq("paystack_ref", reference)
      .maybeSingle()

    if (portfolio) {
      console.log("[verify] portfolio found:", portfolio.id)
      return res.status(200).json({
        success: true,
        portfolioId: portfolio.id,
        slug: portfolio.slug
      })
    }

    // Portfolio not created yet — verify with Flutterwave
    const flwKey = process.env.FLUTTERWAVE_SECRET_KEY
    const flwRes = await fetch(
      "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=" + reference,
      {
        headers: {
          Authorization: "Bearer " + flwKey
        }
      }
    )
    const flwData = await flwRes.json()
    
    console.log("[verify] flutterwave status:", 
      flwData.data?.status)

    if (flwData.status === "success" && flwData.data?.status === "successful") {
      // Payment confirmed but webhook pending
      return res.status(200).json({
        success: true,
        pending: true,
        paymentConfirmed: true
      })
    }

    // Payment was not successful
    return res.status(200).json({
      success: false,
      paymentFailed: true,
      status: flwData.data?.status || "unknown"
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message })
  }
}

async function handleCreateFromWallet(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody);

    const {
      userId, userEmail, fullName, category, categories,
      purchaseCodeUsed, purchaseCodeOwnerId, reference, amountPaid
    } = body;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const baseSlug = (fullName || userEmail || "portfolio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    let slug = baseSlug + "-" + Math.random().toString(36).slice(2, 6);

    const { data: slugExists } = await supabase.from("vp_portfolios").select("id").eq("slug", slug).maybeSingle();
    if (slugExists) slug = baseSlug + "-" + Date.now().toString(36);

    let existingDraft = null;
    if (userId) {
      const { data: draft } = await supabase.from("vp_portfolios").select("id, slug").eq("user_id", userId).eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
      existingDraft = draft;
    }
    if (!existingDraft && userEmail) {
       const { data: draft } = await supabase.from("vp_portfolios").select("id, slug").eq("user_email", userEmail).eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
       existingDraft = draft;
    }

    let portfolio = null;
    let portfolioErr = null;

    if (existingDraft) {
      const { data: updated, error } = await supabase.from("vp_portfolios").update({
        category: category, categories: categories, full_name: fullName || undefined, status: "active", is_paid: true, paystack_ref: reference, slug: existingDraft.slug || slug
      }).eq("id", existingDraft.id).select().maybeSingle();
      portfolio = updated;
      portfolioErr = error;
      if (userId) await supabase.from("vp_portfolios").delete().eq("user_id", userId).eq("status", "draft");
      else if (userEmail) await supabase.from("vp_portfolios").delete().eq("user_email", userEmail).eq("status", "draft");
    } else {
      const { data: inserted, error } = await supabase.from("vp_portfolios").insert({
        user_id: userId, user_email: userEmail, category: category, categories: categories, full_name: fullName, status: "active", is_paid: true, paystack_ref: reference, slug: slug, color_theme: "classic", font_pairing: "refined_editorial"
      }).select().maybeSingle();
      portfolio = inserted;
      portfolioErr = error;
    }

    if (portfolioErr) return res.status(500).json({ error: portfolioErr.message });

    const purchaseAmount = amountPaid || 0;
    const { data: purchaseRecord } = await supabase.from("portfolio_purchases").insert({
      user_id: userId || null, user_email: userEmail || null, user_name: fullName || null, category: category || null, amount: purchaseAmount, paystack_ref: reference, purchase_code_used: purchaseCodeUsed || null, purchase_code_owner_id: purchaseCodeOwnerId || null, reward_amount: 0, reward_status: "none", created_at: new Date().toISOString()
    }).select().maybeSingle();

    if (purchaseCodeOwnerId) {
      let rewardPercent = 0.10;
      let ownerMedal = null;

      const { data: medalStatus } = await supabase
        .from("orders")
        .select("product_name")
        .eq("user_id", purchaseCodeOwnerId)
        .in("status", ["paid", "completed"])
        .in("product_name", ["Plugsy Bronze Medal", "Plugsy Silver Medal", "Plugsy Gold Medal"])
        .order("created_at", { ascending: false });

      if (medalStatus && medalStatus.length > 0) {
        const names = medalStatus.map(o => o.product_name);
        if (names.includes("Plugsy Gold Medal")) ownerMedal = { bonus: 0.20 };
        else if (names.includes("Plugsy Silver Medal")) ownerMedal = { bonus: 0.15 };
        else if (names.includes("Plugsy Bronze Medal")) ownerMedal = { bonus: 0.10 };
        
        if (ownerMedal) {
          rewardPercent += ownerMedal.bonus;
        }
      }

      const reward = Math.round(purchaseAmount * rewardPercent);
      const { data: ownerProfile } = await supabase.from("profiles").select("clerk_id, id, balance, total_referral_earnings, referral_count").eq("clerk_id", purchaseCodeOwnerId).maybeSingle() 
                                  || await supabase.from("profiles").select("clerk_id, id, balance, total_referral_earnings, referral_count").eq("id", purchaseCodeOwnerId).maybeSingle();
      
      if (ownerProfile) {
        await supabase.from("profiles").update({ balance: (ownerProfile.balance || 0) + reward, total_referral_earnings: (ownerProfile.total_referral_earnings || 0) + reward, referral_count: (ownerProfile.referral_count || 0) + 1 }).eq("clerk_id", ownerProfile.clerk_id || ownerProfile.id);
        await supabase.from("portfolio_purchases").update({ reward_amount: reward, reward_status: "paid" }).eq("paystack_ref", reference);
        await supabase.from("messages").insert({ sender_id: "system", sender_role: "system", sender_name: "Plugsy", content: "🎉 You earned ₦" + reward.toLocaleString() + " referral commission! Someone used your code " + (purchaseCodeUsed || "") + " to purchase a " + (category || "portfolio") + " portfolio. Your new balance is ₦" + ((ownerProfile.balance || 0) + reward).toLocaleString() + "." + (ownerMedal ? " (Medal Boost Applied! 🚀)" : ""), user_id: ownerProfile.clerk_id || ownerProfile.id, event: "reward", topic: "referral", is_from_user: false, is_bot: true, is_bot_message: true, read_by_admin: true, read_by_user: false });
      }
    }

    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
      const msg = "🎨 NEW WALLET PORTFOLIO PURCHASE — PLUGSY\n\n👤 " + (fullName || userEmail || "Unknown") + "\n📧 " + (userEmail || "Unknown") + "\n🗂 Category: " + (category || "Unknown") + "\n💰 ₦" + purchaseAmount.toLocaleString() + "\n🎟 Code: " + (purchaseCodeUsed || "None") + "\n\n👉 https://www.plugsy.ng/" + slug;
      await fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg }) });
    }

    return res.status(200).json({ success: true, portfolio });
  } catch (err) {
    console.log("[wallet-create-portfolio] CRASH ERROR:", err);
    return res.status(500).json({ error: "Create error" });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`)
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0]

  const portfolioInitializationPause = getPortfolioInitializationPause(action)
  if (portfolioInitializationPause) {
    return res.status(503).json(portfolioInitializationPause)
  }
  
  if (action === "delete-item") return await handleDeleteItem(req, res)
  if (action === "purchase") return await handlePurchase(req, res)
  if (action === "webhook") return await handleWebhook(req, res)
  if (action === "verify") return await handleVerify(req, res)
  if (action === "create-from-wallet") return await handleCreateFromWallet(req, res)

  return res.status(404).json({ error: "Unknown action" })
}
