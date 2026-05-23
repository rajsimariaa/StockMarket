// ==========================================================
// 1. SUPABASE CLIENT INTEGRATION
// ==========================================================
const supabaseLib = window.supabase;
window.supabase = null;

// Initializer function checking credentials
function initSupabaseConnection() {
  const connBadge = document.getElementById("connection-badge");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
    SUPABASE_URL === "https://your-supabase-project.supabase.co" ||
    SUPABASE_ANON_KEY === "your-supabase-anon-key" ||
    SUPABASE_URL.includes("your-") ||
    SUPABASE_ANON_KEY.includes("your-")) {
    console.error("⚠️ Supabase credentials are missing or default in config.js.");
    connBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1.5 text-rose-400"></i> Config Required';
    connBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30";
    
    const btn = document.getElementById("auth-submit-btn");
    if (btn) {
      btn.disabled = true;
      btn.className = "w-full bg-slate-400 text-white font-semibold py-3 rounded-xl transition-all cursor-not-allowed";
      btn.textContent = "Supabase Credentials Required";
    }
    setTimeout(() => {
      triggerToast("Config Required", "Please configure your Supabase URL and Anon Key in config.js to begin.", true);
    }, 1000);
    return;
  }

  try {
    window.supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    connBadge.innerHTML = '<i class="fa-solid fa-cloud-bolt mr-1.5 text-blue-400 animate-pulse"></i> Supabase Live';
    connBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30";
  } catch (err) {
    console.error("Failed to construct Supabase Client:", err);
    connBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1.5 text-rose-400"></i> Connection Failed';
    connBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30";
  }
}

// ==========================================================
// 1B. RLS TROUBLESHOOTING & AUTO-SEEDING UTILITIES
// ==========================================================
function showPersistentErrorBanner(message) {
  const banner = document.getElementById("persistent-error-banner");
  if (banner) {
    banner.classList.remove("hidden");
  }
}

function hidePersistentError() {
  const banner = document.getElementById("persistent-error-banner");
  if (banner) {
    banner.classList.add("hidden");
  }
}

function copyRLSSql() {
  const sql = `ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_company_prices DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_price_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_portfolios DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_dealt_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_player_turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE fluctuation_cards DISABLE ROW LEVEL SECURITY;`;
  
  navigator.clipboard.writeText(sql).then(() => {
    triggerToast("SQL Copied!", "Copy bypass SQL directly to clipboard. Paste and run in your Supabase SQL Editor.");
  }).catch(err => {
    console.error("Clipboard copy failed:", err);
    triggerToast("Clipboard Error", "Could not copy SQL automatically.", true);
  });
}

// Client-side auto-seeder to prevent foreign key errors if tables are empty
async function ensureDatabaseSeeded() {
  if (!supabase) return;

  try {
    // 1. Check companies table
    const { data: existingComps, error: compFetchErr } = await supabase.from('companies').select('id').limit(1);
    if (compFetchErr) {
      console.warn("Companies fetch error during auto-seed check:", compFetchErr.message);
      if (compFetchErr.message.toLowerCase().includes("row-level security")) {
        showPersistentErrorBanner(compFetchErr.message);
      }
      return;
    }

    if (!existingComps || existingComps.length === 0) {
      console.log("Database 'companies' table is empty. Auto-seeding companies...");
      const companyPayloads = SEED_DATA.companies.map(c => ({
        id: c.id,
        exchange: c.exchange,
        symbol: c.symbol,
        name: c.name,
        base_price: c.base_price
      }));
      const { error: seedCompErr } = await supabase.from('companies').insert(companyPayloads);
      if (seedCompErr) {
        console.error("Auto-seeding companies failed:", seedCompErr);
      } else {
        console.log("Auto-seeding companies successful!");
      }
    }

    // 2. Check fluctuation cards table
    const { data: existingCards, error: cardFetchErr } = await supabase.from('fluctuation_cards').select('id').limit(1);
    if (cardFetchErr) {
      console.warn("Fluctuation cards fetch error during auto-seed check:", cardFetchErr.message);
      return;
    }

    if (!existingCards || existingCards.length === 0) {
      console.log("Database 'fluctuation_cards' table is empty. Auto-seeding cards...");
      const cardPayloads = SEED_DATA.fluctuationCards.map(fc => ({
        id: fc.id,
        company_id: fc.company_id,
        hint_text: fc.hint_text,
        fluctuation_percent: fc.fluctuation_percent
      }));
      const { error: seedCardErr } = await supabase.from('fluctuation_cards').insert(cardPayloads);
      if (seedCardErr) {
        console.error("Auto-seeding fluctuation cards failed:", seedCardErr);
      } else {
        console.log("Auto-seeding fluctuation cards successful!");
      }
    }
  } catch (err) {
    console.error("Error during database auto-seed check:", err);
  }
}

// ==========================================================
// 2. REFERENCE GAME EVENTS & SEED DATA
// ==========================================================
const SEED_DATA = {
  companies: [
    // NSE
    { id: "nse-rel", exchange: "NSE", symbol: "RELIANCE", name: "Reliance Industries Ltd.", base_price: 2400 },
    { id: "nse-tcs", exchange: "NSE", symbol: "TCS", name: "Tata Consultancy Services Ltd.", base_price: 3200 },
    { id: "nse-hdfc", exchange: "NSE", symbol: "HDFCBANK", name: "HDFC Bank Ltd.", base_price: 1500 },
    { id: "nse-infy", exchange: "NSE", symbol: "INFY", name: "Infosys Ltd.", base_price: 1400 },
    { id: "nse-icici", exchange: "NSE", symbol: "ICICIBANK", name: "ICICI Bank Ltd.", base_price: 900 },
    // NASDAQ
    { id: "nas-aapl", exchange: "NASDAQ", symbol: "AAPL", name: "Apple Inc.", base_price: 175 },
    { id: "nas-msft", exchange: "NASDAQ", symbol: "MSFT", name: "Microsoft Corp.", base_price: 420 },
    { id: "nas-googl", exchange: "NASDAQ", symbol: "GOOGL", name: "Alphabet Inc.", base_price: 150 },
    { id: "nas-amzn", exchange: "NASDAQ", symbol: "AMZN", name: "Amazon.com Inc.", base_price: 180 },
    { id: "nas-nvda", exchange: "NASDAQ", symbol: "NVDA", name: "Nvidia Corp.", base_price: 900 },
    // NYSE
    { id: "nyse-brk", exchange: "NYSE", symbol: "BRK.A", name: "Berkshire Hathaway Inc.", base_price: 600 },
    { id: "nyse-jpm", exchange: "NYSE", symbol: "JPM", name: "JPMorgan Chase & Co.", base_price: 190 },
    { id: "nyse-xom", exchange: "NYSE", symbol: "XOM", name: "Exxon Mobil Corp.", base_price: 120 },
    { id: "nyse-wmt", exchange: "NYSE", symbol: "WMT", name: "Walmart Inc.", base_price: 60 },
    { id: "nyse-lly", exchange: "NYSE", symbol: "LLY", name: "Eli Lilly & Co.", base_price: 750 }
  ],

  fluctuationCards: [
    // RELIANCE
    { id: "fc-rel1", company_id: "nse-rel", company_symbol: "RELIANCE", hint_text: "INCREASE OF FII LIMIT", fluctuation_percent: 20 },
    { id: "fc-rel2", company_id: "nse-rel", company_symbol: "RELIANCE", hint_text: "PETROCHEMICAL SUBSIDIES ANNOUNCED", fluctuation_percent: 10 },
    { id: "fc-rel3", company_id: "nse-rel", company_symbol: "RELIANCE", hint_text: "CRUDE OIL MARGIN CRUSH", fluctuation_percent: -12 },
    { id: "fc-rel4", company_id: "nse-rel", company_symbol: "RELIANCE", hint_text: "HIGH TELECOM OVERHEAD CAEX", fluctuation_percent: -5 },
    // TCS
    { id: "fc-tcs1", company_id: "nse-tcs", company_symbol: "TCS", hint_text: "TCS BAGS $2B CLOUD INTEGRATION CONTRACT", fluctuation_percent: 18 },
    { id: "fc-tcs2", company_id: "nse-tcs", company_symbol: "TCS", hint_text: "AI OPTIMIZATION INCREASES MARGINS", fluctuation_percent: 8 },
    { id: "fc-tcs3", company_id: "nse-tcs", company_symbol: "TCS", hint_text: "US TECH SPENDING CANCELLED", fluctuation_percent: -15 },
    { id: "fc-tcs4", company_id: "nse-tcs", company_symbol: "TCS", hint_text: "EMPLOYEE RETENTION WAGE OVERHEAD", fluctuation_percent: -6 },
    // HDFCBANK
    { id: "fc-hdfc1", company_id: "nse-hdfc", company_symbol: "HDFCBANK", hint_text: "DOLLAR DEPRECIATES AGAINST RUPEE", fluctuation_percent: 5 },
    { id: "fc-hdfc2", company_id: "nse-hdfc", company_symbol: "HDFCBANK", hint_text: "MERGER SYNERGIES AT RECORD HIGH", fluctuation_percent: 7 },
    { id: "fc-hdfc3", company_id: "nse-hdfc", company_symbol: "HDFCBANK", hint_text: "RISING FARM LOAN DEFAULTS NPA", fluctuation_percent: -10 },
    { id: "fc-hdfc4", company_id: "nse-hdfc", company_symbol: "HDFCBANK", hint_text: "SERVER OUTAGE PENALTY", fluctuation_percent: -8 },
    // INFY
    { id: "fc-inf1", company_id: "nse-infy", company_symbol: "INFY", hint_text: "SECURES HUGE EUROPEAN AI INFRAS", fluctuation_percent: 14 },
    { id: "fc-inf2", company_id: "nse-infy", company_symbol: "INFY", hint_text: "NEW CEO OUTLINES AGGRESSIVE STRATEGY", fluctuation_percent: 6 },
    { id: "fc-inf3", company_id: "nse-infy", company_symbol: "INFY", hint_text: "PROMOTERS REDUCE STAKE", fluctuation_percent: -5 },
    { id: "fc-inf4", company_id: "nse-infy", company_symbol: "INFY", hint_text: "ACCOUNTING FRAUD WHISTLEBLOWER", fluctuation_percent: -20 },
    // ICICIBANK
    { id: "fc-ici1", company_id: "nse-icici", company_symbol: "ICICIBANK", hint_text: "RETAIL CREDIT BOOM AT 25% YOY", fluctuation_percent: 10 },
    { id: "fc-ici2", company_id: "nse-icici", company_symbol: "ICICIBANK", hint_text: "BROKERAGE STRONG BUY RATING", fluctuation_percent: 5 },
    { id: "fc-ici3", company_id: "nse-icici", company_symbol: "ICICIBANK", hint_text: "CORPORATE DEBT PROVISIONS RISE", fluctuation_percent: -12 },
    { id: "fc-ici4", company_id: "nse-icici", company_symbol: "ICICIBANK", hint_text: "HIGH INTEREST RATES CAP DEMAND", fluctuation_percent: -4 },

    // AAPL
    { id: "fc-ap1", company_id: "nas-aapl", company_symbol: "AAPL", hint_text: "VISION PRO SALES BEAT EXPECTATIONS", fluctuation_percent: 16 },
    { id: "fc-ap2", company_id: "nas-aapl", company_symbol: "AAPL", hint_text: "IPHONE UPGRADE CYCLE ACCELERATES", fluctuation_percent: 9 },
    { id: "fc-ap3", company_id: "nas-aapl", company_symbol: "AAPL", hint_text: "EU REGULATORS IMPOSE GIANT FINE", fluctuation_percent: -14 },
    { id: "fc-ap4", company_id: "nas-aapl", company_symbol: "AAPL", hint_text: "SUPPLY CHAIN DELAYS IPAD UNIT", fluctuation_percent: -5 },
    // MSFT
    { id: "fc-ms1", company_id: "nas-msft", company_symbol: "MSFT", hint_text: "AZURE AI EXPANDS CLOUD DOMINANCE", fluctuation_percent: 15 },
    { id: "fc-ms2", company_id: "nas-msft", company_symbol: "MSFT", hint_text: "WINDOWS COPILOT WIDESPREAD ADOPTION", fluctuation_percent: 7 },
    { id: "fc-ms3", company_id: "nas-msft", company_symbol: "MSFT", hint_text: "CYBER ATTACK COMPROMISES EMAILS", fluctuation_percent: -11 },
    { id: "fc-ms4", company_id: "nas-msft", company_symbol: "MSFT", hint_text: "ANTITRUST BLOCKS NEW ACQUISITION", fluctuation_percent: -6 },
    // GOOGL
    { id: "fc-go1", company_id: "nas-googl", company_symbol: "GOOGL", hint_text: "CLOUD SECURES PROFITABILITY STREAK", fluctuation_percent: 12 },
    { id: "fc-go2", company_id: "nas-googl", company_symbol: "GOOGL", hint_text: "GEMINI AI AD REVENUE DOUBLE DIGIT", fluctuation_percent: 8 },
    { id: "fc-go3", company_id: "nas-googl", company_symbol: "GOOGL", hint_text: "DOJ WINS MONOPOLY ANTITRUST SUIT", fluctuation_percent: -18 },
    { id: "fc-go4", company_id: "nas-googl", company_symbol: "GOOGL", hint_text: "ADVERTISING CAPTURED BY TIKTOK", fluctuation_percent: -7 },
    // AMZN
    { id: "fc-am1", company_id: "nas-amzn", company_symbol: "AMZN", hint_text: "PRIME SUBSCRIPTION RETENTION UP", fluctuation_percent: 10 },
    { id: "fc-am2", company_id: "nas-amzn", company_symbol: "AMZN", hint_text: "AWS CONTRACTS POWER CHEAP SOLAR", fluctuation_percent: 6 },
    { id: "fc-am3", company_id: "nas-amzn", company_symbol: "AMZN", hint_text: "FTC ANNOUNCES BREAKUP INVESTIGATION", fluctuation_percent: -15 },
    { id: "fc-am4", company_id: "nas-amzn", company_symbol: "AMZN", hint_text: "WAREHOUSE LABOUR STRIKES AT HOLIDAY", fluctuation_percent: -8 },
    // NVDA
    { id: "fc-nv1", company_id: "nas-nvda", company_symbol: "NVDA", hint_text: "BLACKWELL CHIPS SOLD OUT 18 MONTHS", fluctuation_percent: 25 },
    { id: "fc-nv2", company_id: "nas-nvda", company_symbol: "NVDA", hint_text: "RECORD GROSS MARGIN REACHES 78%", fluctuation_percent: 12 },
    { id: "fc-nv3", company_id: "nas-nvda", company_symbol: "NVDA", hint_text: "US EXPANDS CHIP EXPORT CURBS", fluctuation_percent: -16 },
    { id: "fc-nv4", company_id: "nas-nvda", company_symbol: "NVDA", hint_text: "COMPETITOR REVEALS FASTER INFRA", fluctuation_percent: -9 },

    // BRK.A
    { id: "fc-brk1", company_id: "nyse-brk", company_symbol: "BRK.A", hint_text: "CASH PILE REACHES RECORD $180B", fluctuation_percent: 8 },
    { id: "fc-brk2", company_id: "nyse-brk", company_symbol: "BRK.A", hint_text: "INSURANCE UNDERWRITING SURGES", fluctuation_percent: 5 },
    { id: "fc-brk3", company_id: "nyse-brk", company_symbol: "BRK.A", hint_text: "CONSUMER PORTFOLIO VALUATION SLIDE", fluctuation_percent: -9 },
    { id: "fc-brk4", company_id: "nyse-brk", company_symbol: "BRK.A", hint_text: "GEICO LOSS FREQUENCIES SPIKE", fluctuation_percent: -4 },
    // JPM
    { id: "fc-jp1", company_id: "nyse-jpm", company_symbol: "JPM", hint_text: "MERGERS BOOM BRINGS M&A FEES", fluctuation_percent: 14 },
    { id: "fc-jp2", company_id: "nyse-jpm", company_symbol: "JPM", hint_text: "NET INTEREST INCOME OUTLOOK UPGRADE", fluctuation_percent: 7 },
    { id: "fc-jp3", company_id: "nyse-jpm", company_symbol: "JPM", hint_text: "REGULATORS DEMAND BUFFER DEPOSIT", fluctuation_percent: -10 },
    { id: "fc-jp4", company_id: "nyse-jpm", company_symbol: "JPM", hint_text: "CREDIT DELINQUENCIES ESCALATE", fluctuation_percent: -6 },
    // XOM
    { id: "fc-xo1", company_id: "nyse-xom", company_symbol: "XOM", hint_text: "GUYANA OFFSHORE RESERVES OUTPERFORM", fluctuation_percent: 11 },
    { id: "fc-xo2", company_id: "nyse-xom", company_symbol: "XOM", hint_text: "NATURAL GAS PRICING SHARP ADVANCE", fluctuation_percent: 6 },
    { id: "fc-xo3", company_id: "nyse-xom", company_symbol: "XOM", hint_text: "OPEC UNEXPECTED QUOTA EXTENSION", fluctuation_percent: -13 },
    { id: "fc-xo4", company_id: "nyse-xom", company_symbol: "XOM", hint_text: "CARBON EMISSIONS REGULATORY PENALTY", fluctuation_percent: -5 },
    // WMT
    { id: "fc-wm1", company_id: "nyse-wmt", company_symbol: "WMT", hint_text: "WALMART RAISES FULL YEAR GUIDANCE", fluctuation_percent: 10 },
    { id: "fc-wm2", company_id: "nyse-wmt", company_symbol: "WMT", hint_text: "E-COMMERCE GROWS 22% EXPRESS DELIV", fluctuation_percent: 6 },
    { id: "fc-wm3", company_id: "nyse-wmt", company_symbol: "WMT", hint_text: "FREIGHT COST SPIKE ON PORT BLOCKS", fluctuation_percent: -8 },
    { id: "fc-wm4", company_id: "nyse-wmt", company_symbol: "WMT", hint_text: "RETAIL THEFT CAUSES SHRINKAGE", fluctuation_percent: -5 },
    // LLY
    { id: "fc-ly1", company_id: "nyse-lly", company_symbol: "LLY", hint_text: "MOUNJARO DRUG GLOBAL APPROVAL", fluctuation_percent: 22 },
    { id: "fc-ly2", company_id: "nyse-lly", company_symbol: "LLY", hint_text: "ALZHEIMER PHASE III HIGH SCORE", fluctuation_percent: 13 },
    { id: "fc-ly3", company_id: "nyse-lly", company_symbol: "LLY", hint_text: "FDA MANUFACTURING FACILITY INQUIRY", fluctuation_percent: -15 },
    { id: "fc-ly4", company_id: "nyse-lly", company_symbol: "LLY", hint_text: "CHEAP COMPETITOR BIOSIMILAR OBESITY", fluctuation_percent: -10 }
  ]
};

// ==========================================================
// 4. ACTIVE GAME STATE OBJECTS
// ==========================================================
let gameState = {
  me: null,             // Current player representation
  room: null,           // Current active room record
  players: [],          // Active players in current room
  companies: [],        // Filtered top 5 companies
  prices: {},           // company_id -> current_price
  portfolios: {},       // company_id -> {owned, mortgaged}
  myDealtCards: [],     // Dealt cards in my hand
  dealtCardsAll: [],    // All cards dealt in the room (for Chairman inspection)
  turnsStatus: [],      // Sub-round action indicators
  priceHistory: {}      // company_id -> array of prices
};

// ==========================================================
// 5. BOOTSTRAP APP CONTROLLER
// ==========================================================
window.addEventListener("DOMContentLoaded", () => {
  initSupabaseConnection();

  // Auto-fill random username
  const randomId = Math.floor(1000 + Math.random() * 9000);
  document.getElementById("auth-username").value = `Trader_${randomId}`;

  // Check URL parameters for room code invite link
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room') || urlParams.get('code');
  if (roomCode) {
    const joinInput = document.getElementById("join-room-code");
    if (joinInput) {
      joinInput.value = roomCode.trim().toUpperCase();
    }
  }

  // Load view based on session
  checkActiveSession();
});

function showScreen(screenId) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("menu-screen").classList.add("hidden");
  document.getElementById("lobby-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.add("hidden");

  document.getElementById(screenId).classList.remove("hidden");
}

function triggerToast(title, message, isError = false) {
  const toast = document.getElementById("toast-notif");
  const tTitle = document.getElementById("toast-title");
  const tMessage = document.getElementById("toast-message");
  const tIcon = document.getElementById("toast-icon");

  tTitle.textContent = title;
  tMessage.textContent = message;

  if (isError) {
    tIcon.innerHTML = '<i class="fa-solid fa-circle-xmark text-lg text-rose-500"></i>';
  } else {
    tIcon.innerHTML = '<i class="fa-solid fa-circle-check text-lg text-emerald-500"></i>';
  }

  toast.className = "fixed bottom-5 right-5 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 transform translate-y-0 opacity-100 transition-all duration-300 border border-slate-800";

  setTimeout(() => {
    toast.className = "fixed bottom-5 right-5 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 transform translate-y-20 opacity-0 transition-all duration-300 border border-slate-800";
  }, 4000);
}

// ==========================================================
// 6. AUTHENTICATION CONTROLLER (Live Supabase Server)
// ==========================================================
let isSignupMode = false;
function toggleAuthMode() {
  isSignupMode = !isSignupMode;
  const signupFields = document.getElementById("auth-signup-fields");
  const submitBtn = document.getElementById("auth-submit-btn");
  const switchBtn = document.getElementById("auth-switch-btn");
  const switchPrompt = document.getElementById("auth-switch-prompt");

  if (isSignupMode) {
    signupFields.classList.remove("hidden");
    submitBtn.textContent = "Create Account";
    switchBtn.textContent = "Sign In";
    switchPrompt.textContent = "Already have an account?";
  } else {
    signupFields.classList.add("hidden");
    submitBtn.textContent = "Sign In";
    switchBtn.textContent = "Sign Up";
    switchPrompt.textContent = "Don't have an account?";
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const username = document.getElementById("auth-username").value.trim();

  const errorMsg = document.getElementById("auth-error-msg");
  const errorText = document.getElementById("auth-error-text");

  errorMsg.classList.add("hidden");

  try {
    if (isSignupMode) {
      // 1. Sign up Supabase user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { username } }
      });
      if (authError) throw authError;

      if (authData.user) {
        // 2. Insert profile registry
        const { error: profileError } = await supabase.from('players').insert({
          id: authData.user.id,
          username: username,
          email: email,
          highest_score: 1000000.00
        });
        if (profileError) console.warn("Profile creation warning:", profileError.message);
      }

      triggerToast("Registration Complete", "Account created successfully. Logging you in!");
      // Auto login trigger
    }

    // 2. Sign In
    const { data: signData, error: signError } = await supabase.auth.signInWithPassword({ email, password });
    if (signError) throw signError;

    triggerToast("Access Granted", "Logged in to Supabase cloud database.");
    checkActiveSession();

  } catch (err) {
    errorText.textContent = err.message;
    errorMsg.classList.remove("hidden");
  }
}

async function checkActiveSession() {
  let user = null;
  if (supabase) {
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      if (session) {
        user = session.user;
        // Fetch profile details
        const { data: profile, error: profileFetchErr } = await supabase.from('players').select('*').eq('id', user.id).maybeSingle();
        
        if (profileFetchErr) {
          console.warn("Error fetching profile details:", profileFetchErr.message);
          if (profileFetchErr.message.toLowerCase().includes("row-level security")) {
            showPersistentErrorBanner(profileFetchErr.message);
          }
        }

        if (profile) {
          user.username = profile.username;
          hidePersistentError();
        } else {
          // Self-healing: automatically create the missing profile row in the 'players' table
          const generatedUsername = user.user_metadata?.username || user.email.split("@")[0] || `Trader_${Math.floor(1000 + Math.random() * 9000)}`;
          const { error: insertErr } = await supabase.from('players').insert({
            id: user.id,
            username: generatedUsername,
            email: user.email,
            highest_score: 1000000.00
          });
          if (!insertErr) {
            console.log("Successfully self-healed missing profile for:", user.id);
            user.username = generatedUsername;
            hidePersistentError();
          } else {
            console.warn("Could not self-heal profile creation:", insertErr.message);
            user.username = generatedUsername;
            if (insertErr.message.toLowerCase().includes("row-level security")) {
              showPersistentErrorBanner(insertErr.message);
            }
          }
        }
      }
    } catch (sessionEx) {
      console.error("Session verification error:", sessionEx);
    }
  }

  if (user) {
    gameState.me = user;
    document.getElementById("user-profile-widget").classList.remove("hidden");
    document.getElementById("header-username").textContent = user.username;
    showScreen("menu-screen");
    
    // Auto-seed the database in the background to ensure reference data exists
    ensureDatabaseSeeded();
  } else {
    document.getElementById("user-profile-widget").classList.add("hidden");
    showScreen("auth-screen");
  }
}

async function handleLogout() {
  if (supabase) {
    await supabase.auth.signOut();
  }
  gameState.me = null;
  checkActiveSession();
}

// ==========================================================
// 7. ROOM CREATION & LOBBY MANAGEMENT (REALTIME INTEGRATION)
// ==========================================================
async function ensurePlayerProfileExists() {
  if (!gameState.me) return;
  
  let profile = null;
  try {
    const { data, error: selectErr } = await supabase.from('players').select('id').eq('id', gameState.me.id).maybeSingle();
    if (!selectErr) {
      profile = data;
    } else {
      console.warn("Profile fetch warning:", selectErr.message);
      if (selectErr.message.toLowerCase().includes("row-level security")) {
        showPersistentErrorBanner(selectErr.message);
      }
    }
  } catch (err) {
    console.warn("Profile query error:", err);
  }

  if (!profile) {
    console.log("Proactively self-healing missing player profile...");
    const generatedUsername = gameState.me.user_metadata?.username || gameState.me.email?.split("@")[0] || `Trader_${Math.floor(1000 + Math.random() * 9000)}`;
    const { error: insertErr } = await supabase.from('players').insert({
      id: gameState.me.id,
      username: generatedUsername,
      email: gameState.me.email || `${generatedUsername}@example.com`,
      highest_score: 1000000.00
    });
    
    if (insertErr) {
      console.error("Proactive profile self-healing failed:", insertErr);
      
      // Check for row-level security policy blockages (case-insensitive)
      if (insertErr.message && insertErr.message.toLowerCase().includes("row-level security")) {
        showPersistentErrorBanner(insertErr.message);
        throw new Error("Row-Level Security (RLS) is active and blocking profile registry! To fix this instantly, please click the 'Copy Bypass SQL' button above and run it in your Supabase SQL Editor to disable RLS and allow multiplayer sandbox access.");
      }
      
      // Check for foreign key constraint violation (old cached session token)
      if (insertErr.message && (insertErr.message.toLowerCase().includes("foreign key") || insertErr.code === "23503")) {
        throw new Error("Your browser has a cached session from an old database. Please click the Sign Out button (exit door icon) in the top-right corner of the header, then click Sign Up to register a fresh player account in your new database.");
      }
      
      // If it is a duplicate key issue, we can safely proceed because the profile actually exists in the database
      if (insertErr.code === "23505") {
        console.log("Profile already exists in database (duplicate code ignored).");
        hidePersistentError();
        return;
      }
      
      throw new Error(`Unable to verify player profile: ${insertErr.message}. Please try logging out and logging back in.`);
    }
    console.log("Profile self-healing complete.");
    hidePersistentError();
  } else {
    hidePersistentError();
  }
}

async function handleCreateRoom() {
  // Live Supabase Mode - Proactive profile self-healing check
  try {
    await ensurePlayerProfileExists();
    hidePersistentError();
  } catch (profileErr) {
    triggerToast("Profile Verification Failed", profileErr.message, true);
    showPersistentErrorBanner(profileErr.message);
    return;
  }

  const exchange = document.getElementById("config-exchange").value;
  const rounds = parseInt(document.getElementById("config-rounds").value);
  const maxPlayers = parseInt(document.getElementById("config-max-players").value);

  const shortSell = document.getElementById("config-toggle-short").checked;
  const loanMortgage = document.getElementById("config-toggle-loan").checked;
  const officers = document.getElementById("config-toggle-officers").checked;

  // Generate 6 letter alphanumeric room code
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Avoid highly ambiguous letters
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  const roomPayload = {
    code: code,
    host_id: gameState.me.id,
    status: "waiting",
    max_players: maxPlayers,
    total_rounds: rounds,
    stock_exchange: exchange,
    short_sell_enabled: shortSell,
    loan_mortgage_enabled: loanMortgage,
    chairman_ceo_enabled: officers,
    current_round: 0,
    current_sub_round: 0,
    turn_order: []
  };

  // Live Supabase Mode
  try {
    const { data: newRoom, error: roomErr } = await supabase.from('rooms').insert(roomPayload).select().single();
    if (roomErr) throw roomErr;

    // Host joins own room in DB
    const { error: joinErr } = await supabase.from('room_players').insert({
      room_id: newRoom.id,
      player_id: gameState.me.id,
      cash: 1000000.00,
      loan_amount: 0.00,
      is_ready: true
    });
    if (joinErr) throw joinErr;

    gameState.room = newRoom;
    enterLobby();
  } catch (err) {
    triggerToast("Lobby Creation Error", err.message, true);
    if (err.message && err.message.toLowerCase().includes("row-level security")) {
      showPersistentErrorBanner(err.message);
    }
  }
}

async function handleJoinRoom() {
  const code = document.getElementById("join-room-code").value.trim().toUpperCase();
  const joinErr = document.getElementById("join-error-msg");
  const joinErrText = document.getElementById("join-error-text");
  joinErr.classList.add("hidden");

  if (!code || code.length !== 6) {
    joinErrText.textContent = "Please enter a valid 6-character room code";
    joinErr.classList.remove("hidden");
    return;
  }

  // Live Supabase Join - Proactive profile self-healing check
  try {
    await ensurePlayerProfileExists();
    hidePersistentError();
  } catch (profileErr) {
    joinErrText.textContent = profileErr.message;
    joinErr.classList.remove("hidden");
    showPersistentErrorBanner(profileErr.message);
    return;
  }

  try {
    const { data: room, error: findError } = await supabase.from('rooms').select('*').eq('code', code).eq('status', 'waiting').single();
    if (findError || !room) {
      throw new Error("No waiting game room found matching this code");
    }

    // Add to room_players
    const { error: joinError } = await supabase.from('room_players').insert({
      room_id: room.id,
      player_id: gameState.me.id,
      cash: 1000000.00,
      is_ready: false
    });
    if (joinError && joinError.code !== '23505') { // Ignore unique constraint if already joined
      throw joinError;
    }

    gameState.room = room;
    enterLobby();

  } catch (err) {
    joinErrText.textContent = err.message;
    joinErr.classList.remove("hidden");
    if (err.message && err.message.toLowerCase().includes("row-level security")) {
      showPersistentErrorBanner(err.message);
    }
  }
}

let lobbySubscription = null;
function enterLobby() {
  showScreen("lobby-screen");

  document.getElementById("lobby-code-display").innerHTML = `${gameState.room.code} <button onclick="copyLobbyCode()" class="text-slate-400 hover:text-blue-600 text-sm ml-1" title="Copy Invite Link"><i class="fa-regular fa-copy"></i></button>`;
  document.getElementById("lobby-exchange-display").textContent = gameState.room.stock_exchange;
  document.getElementById("lobby-rounds-display").textContent = `${gameState.room.total_rounds} Rounds`;

  refreshLobbyPlayers();
  setupLobbyRealtime();
}

async function refreshLobbyPlayers() {
  // Fetch current room players
  const { data: dbPlayers, error } = await supabase.from('room_players').select(`
    player_id, is_ready, cash,
    players ( username )
  `).eq('room_id', gameState.room.id);

  if (!error && dbPlayers) {
    gameState.players = dbPlayers.map(p => ({
      player_id: p.player_id,
      is_ready: p.is_ready,
      cash: p.cash,
      username: p.players ? p.players.username : "Unregistered Player"
    }));
  }

  const pCount = gameState.players.length;
  document.getElementById("lobby-player-count").textContent = pCount;
  document.getElementById("lobby-player-max").textContent = gameState.room.max_players;

  const listDiv = document.getElementById("lobby-players-list");
  listDiv.innerHTML = "";

  gameState.players.forEach(p => {
    const isMe = p.player_id === gameState.me.id;
    const isHost = p.player_id === gameState.room.host_id;

    const card = document.createElement("div");
    card.className = `flex justify-between items-center px-4 py-3 rounded-xl border ${isMe ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100 bg-slate-50/50'}`;
    card.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm">
          ${p.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <span class="font-semibold text-slate-800 text-sm">${p.username} ${isMe ? '<span class="text-[10px] text-blue-500 font-bold bg-blue-100 px-1.5 py-0.5 rounded ml-1">YOU</span>' : ''}</span>
          ${isHost ? '<span class="text-[9px] text-amber-600 font-bold bg-amber-100 px-1 rounded ml-1"><i class="fa-solid fa-crown text-[8px] mr-0.5"></i> HOST</span>' : ''}
        </div>
      </div>
      <div>
        ${p.is_ready
        ? '<span class="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full"><i class="fa-solid fa-check mr-1"></i> Ready</span>'
        : '<span class="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full"><i class="fa-regular fa-clock mr-1"></i> Joining</span>'
      }
      </div>
    `;
    listDiv.appendChild(card);
  });

  // Disable/Enable Start button based on host and ready status
  const isMeHost = gameState.me.id === gameState.room.host_id;
  const startBtn = document.getElementById("lobby-start-btn");

  if (isMeHost) {
    startBtn.classList.remove("hidden");
    const allReady = gameState.players.every(p => p.is_ready);
    startBtn.disabled = !allReady;
  } else {
    startBtn.classList.add("hidden");
  }
}

let activeLobbyRoomId = null;

function setupLobbyRealtime() {
  if (lobbySubscription) {
    if (activeLobbyRoomId === gameState.room.id) {
      console.log("Lobby subscription already active for room:", gameState.room.id);
      return;
    }
    unsubscribeLobby();
  }

  const roomId = gameState.room.id;
  activeLobbyRoomId = roomId;

  lobbySubscription = supabase.channel(`lobby:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
      refreshLobbyPlayers();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      if (payload.new.status === 'active') {
        gameState.room = payload.new;
        unsubscribeLobby();
        startActiveGameUI();
      }
    })
    .subscribe();
}

function unsubscribeLobby() {
  if (lobbySubscription) {
    supabase.removeChannel(lobbySubscription);
    lobbySubscription = null;
  }
  activeLobbyRoomId = null;
}

function copyLobbyCode() {
  const joinLink = `${window.location.origin}${window.location.pathname}?room=${gameState.room.code}`;
  navigator.clipboard.writeText(joinLink).then(() => {
    triggerToast("Invite Link Copied!", "Shared join link directly to clipboard.");
  }).catch(err => {
    console.error("Clipboard link copy failed, falling back to code:", err);
    navigator.clipboard.writeText(gameState.room.code);
    triggerToast("Room Code Copied", "Copy code directly to clipboard to share.");
  });
}

async function toggleReadyStatus() {
  const myState = gameState.players.find(p => p.player_id === gameState.me.id);
  const nextReady = !myState.is_ready;

  try {
    const { error: readyErr } = await supabase.from('room_players').update({ is_ready: nextReady }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    if (readyErr) throw readyErr;
  } catch (err) {
    console.error("Failed to toggle ready status:", err);
    triggerToast("Failed to toggle ready status", err.message, true);
  }
}

// ==========================================================
// 8. ACTIVE GAME BOOT & ROTATION ENGINE
// ==========================================================
async function handleStartGame() {
  // Live Supabase start logic
  try {
    const comps = SEED_DATA.companies.filter(c => c.exchange.toUpperCase() === gameState.room.stock_exchange.toUpperCase());

    // 1. Seed Company prices in DB for the room
    const priceInserts = comps.map(c => ({
      room_id: gameState.room.id,
      company_id: c.id,
      current_price: c.base_price
    }));
    const { error: priceErr } = await supabase.from('room_company_prices').insert(priceInserts);
    if (priceErr) throw priceErr;

    // 2. Set up turn order rotation
    const order = gameState.players.map(p => p.player_id);
    const { data: updatedRoom, error } = await supabase.from('rooms').update({
      status: 'active',
      current_round: 1,
      current_sub_round: 1,
      turn_order: order,
      current_turn_player_id: order[0]
    }).eq('id', gameState.room.id).select().single();

    if (error) throw error;

    gameState.room = updatedRoom;

    // Deal cards and proceed
    await dealMainRoundCards();
    startActiveGameUI();

  } catch (err) {
    triggerToast("Failed to initialize game", err.message, true);
  }
}

// Deals 10 random fluctuation cards from reference deck to each player
async function dealMainRoundCards(targetRoundNumber = null) {
  const roundNum = targetRoundNumber || (gameState.room ? gameState.room.current_round : 1);
  const exchangeCompanies = SEED_DATA.companies.filter(c => c.exchange.toUpperCase() === gameState.room.stock_exchange.toUpperCase());
  const exchangeCompanyIds = exchangeCompanies.map(c => c.id);

  // Filter fluctuation cards for active companies
  const validCards = SEED_DATA.fluctuationCards.filter(fc => exchangeCompanyIds.includes(fc.company_id));

  if (validCards.length === 0) {
    console.error("No valid fluctuation cards found for exchange:", gameState.room.stock_exchange);
    triggerToast("Card Dealing Failed", "No fluctuation cards configured for this exchange.", true);
    return;
  }

  // Supabase deal logic
  try {
    // ⚡ Direct DB Fetch to prevent late-joining player sync lag / race conditions
    const { data: dbPlayers, error: fetchPlayersErr } = await supabase
      .from('room_players')
      .select('player_id, players(username, email)')
      .eq('room_id', gameState.room.id);
    
    if (fetchPlayersErr) throw fetchPlayersErr;
    if (!dbPlayers || dbPlayers.length === 0) {
      console.warn("No players found in room_players during card deal.");
      return;
    }

    for (const p of dbPlayers) {
      const pId = p.player_id;
      const playerUsername = p.players ? p.players.username : `Trader_${Math.floor(1000 + Math.random() * 9000)}`;
      const playerEmail = p.players ? p.players.email : `${playerUsername}@example.com`;

      const playerDealtInserts = [];
      for (let i = 0; i < 10; i++) {
        const card = validCards[Math.floor(Math.random() * validCards.length)];
        playerDealtInserts.push({
          room_id: gameState.room.id,
          player_id: pId,
          card_id: card.id,
          round_number: roundNum,
          is_discarded: false
        });
      }

      // Try inserting cards for this player
      let { error: insertErr } = await supabase.from('room_dealt_cards').insert(playerDealtInserts);
      
      // Auto-healing block: if insert fails due to foreign key constraint on the player profile
      if (insertErr && (insertErr.message.toLowerCase().includes("foreign key") || insertErr.code === "23503")) {
        console.warn(`[Self-Healing] Missing player profile detected for player_id: ${pId}. Proactively inserting player profile...`);
        const { error: healErr } = await supabase.from('players').insert({
          id: pId,
          username: playerUsername,
          email: playerEmail,
          highest_score: 1000000.00
        });

        if (!healErr || healErr.code === "23505") { // Ignore if exists
          console.log(`[Self-Healing] Successfully created player profile. Retrying card deal for ${playerUsername}...`);
          // Retry insertion after profile self-healing
          const { error: retryErr } = await supabase.from('room_dealt_cards').insert(playerDealtInserts);
          if (retryErr) {
            console.error(`[Self-Healing] Retry failed for player_id: ${pId}:`, retryErr.message);
          } else {
            console.log(`[Self-Healing] Retry successful for player_id: ${pId}`);
          }
        } else {
          console.error(`[Self-Healing] Profile creation retry failed for player_id: ${pId}:`, healErr.message);
        }
      } else if (insertErr) {
        console.error(`Failed to insert cards for player_id: ${pId}:`, insertErr.message);
      }
    }
  } catch (err) {
    console.error("Card deal error:", err);
    triggerToast("Card Dealing Failed", err.message, true);
  }
}

// Setup visual UI boards
function startActiveGameUI() {
  showScreen("game-screen");
  initRealtimeGameplaySubscriptions();
  refreshActiveGameUI();
}

let gameSubscription = null;
let activeSubscriptionRoomId = null;

function initRealtimeGameplaySubscriptions() {
  if (gameSubscription) {
    if (activeSubscriptionRoomId === gameState.room.id) {
      console.log("Game subscription already active for room:", gameState.room.id);
      return;
    }
    supabase.removeChannel(gameSubscription);
    gameSubscription = null;
    activeSubscriptionRoomId = null;
  }

  const roomId = gameState.room.id;
  activeSubscriptionRoomId = roomId;

  gameSubscription = supabase.channel(`game:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      gameState.room = payload.new;

      if (gameState.room.status === 'finished') {
        triggerGameOver();
      } else {
        refreshActiveGameUI();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_company_prices', filter: `room_id=eq.${roomId}` }, () => {
      refreshActiveGameUI();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
      refreshActiveGameUI();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_dealt_cards', filter: `room_id=eq.${roomId}` }, () => {
      refreshActiveGameUI();
    })
    .subscribe();
}

// ==========================================================
// 9. REFRESH DYNAMIC GAME METRICS
// ==========================================================
// Safe element binders
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function safeSetHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ==========================================================
// 8B. CUSTOM NON-TRADITIONAL TURN NOTIFICATION SYSTEM
// ==========================================================
let titleFlashInterval = null;
function startTitleFlashing() {
  if (titleFlashInterval) clearInterval(titleFlashInterval);
  const originalTitle = "🏆 Stock Market Board Game (SMBG)";
  let isAlert = false;
  titleFlashInterval = setInterval(() => {
    document.title = isAlert ? "🔔 YOUR TURN - SMBG PRO!" : originalTitle;
    isAlert = !isAlert;
  }, 1000);

  // Stop flashing when user clicks anywhere on the document or presses any key
  const stopFlashing = () => {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = originalTitle;
    document.removeEventListener('mousedown', stopFlashing);
    document.removeEventListener('keydown', stopFlashing);
  };
  document.addEventListener('mousedown', stopFlashing);
  document.addEventListener('keydown', stopFlashing);
}

function triggerVisualTurnAlert() {
  // 1. Flash document title for background tabs/windows
  startTitleFlashing();

  // 2. Add shake effect to game screen to catch attention physically
  const gameBoard = document.getElementById("game-screen");
  if (gameBoard) {
    gameBoard.classList.remove("shake-effect");
    void gameBoard.offsetWidth; // Trigger reflow to restart CSS animation
    gameBoard.classList.add("shake-effect");
    setTimeout(() => {
      gameBoard.classList.remove("shake-effect");
    }, 1000);
  }

  // 3. Slide down premium turn alert banner
  const banner = document.getElementById("turn-alert-banner");
  if (banner) {
    banner.classList.remove("-translate-y-full", "opacity-0", "pointer-events-none");
    banner.classList.add("translate-y-0", "opacity-100");
  }

  // 4. Highlight turn card
  const turnContainer = document.getElementById("active-player-name")?.closest('.bg-gradient-to-tr');
  if (turnContainer) {
    turnContainer.classList.add("neon-turn-glow");
  }
}

function dismissTurnAlert() {
  // 1. Clear title flashing
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = "🏆 Stock Market Board Game (SMBG)";
  }

  // 2. Hide banner
  const banner = document.getElementById("turn-alert-banner");
  if (banner) {
    banner.classList.remove("translate-y-0", "opacity-100");
    banner.classList.add("-translate-y-full", "opacity-0", "pointer-events-none");
  }

  // 3. Remove glow
  const turnContainer = document.getElementById("active-player-name")?.closest('.bg-gradient-to-tr');
  if (turnContainer) {
    turnContainer.classList.remove("neon-turn-glow");
  }
}

function triggerTurnNotification() {
  const isMyTurn = gameState.me && gameState.room && gameState.me.id === gameState.room.current_turn_player_id;
  if (!isMyTurn) return;

  // 1. Mobile Vibration API (vibrate 200ms, pause 100ms, vibrate 200ms)
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  // 2. Desktop/Laptop custom visual and title alert
  triggerVisualTurnAlert();
}

async function refreshActiveGameUI() {
  // Guard check to make sure gameState.me and gameState.room are fully populated
  if (!gameState.me || !gameState.room) {
    console.warn("refreshActiveGameUI called but gameState.me or gameState.room is not defined yet.");
    return;
  }

  // Live Supabase Sync Queries (Individually Isolated and caught to guarantee robust execution)
  
  // 1. Fetch Room Players
  try {
    const { data: rpData, error: rpErr } = await supabase.from('room_players').select('*, players(username)').eq('room_id', gameState.room.id);
    if (rpErr) throw rpErr;
    if (rpData) {
      gameState.players = rpData.map(p => ({
        player_id: p.player_id,
        username: p.players ? p.players.username : "Player",
        cash: parseFloat(p.cash),
        loan_amount: parseFloat(p.loan_amount),
        loan_taken_round: parseInt(p.loan_taken_round || 0)
      }));
    }
  } catch (err) {
    console.error("UI Sync: Error fetching room players:", err);
  }

  // 2. Fetch Companies and current prices
  try {
    gameState.companies = SEED_DATA.companies.filter(c => c.exchange.toUpperCase() === gameState.room.stock_exchange.toUpperCase());
    const { data: dbPrices, error: pricesErr } = await supabase.from('room_company_prices').select('*').eq('room_id', gameState.room.id);
    if (pricesErr) throw pricesErr;
    if (dbPrices) {
      gameState.prices = {};
      dbPrices.forEach(p => {
        gameState.prices[p.company_id] = parseFloat(p.current_price);
      });
    }
  } catch (err) {
    console.error("UI Sync: Error fetching company prices:", err);
  }

  // 3. Fetch all portfolios in this room (for officer calculation & leaderboards)
  try {
    const { data: dbPortfolios, error: portfoliosErr } = await supabase.from('room_portfolios').select('*').eq('room_id', gameState.room.id);
    if (portfoliosErr) throw portfoliosErr;
    gameState.allPortfolios = dbPortfolios || [];

    gameState.portfolios = {};
    if (gameState.companies) {
      gameState.companies.forEach(c => {
        const p = dbPortfolios ? dbPortfolios.find(item => item.company_id === c.id && item.player_id === gameState.me.id) : null;
        gameState.portfolios[c.id] = p ? { owned: p.shares_owned, mortgaged: p.shares_mortgaged } : { owned: 0, mortgaged: 0 };
      });
    }
  } catch (err) {
    console.error("UI Sync: Error fetching portfolios:", err);
  }

  // 4. Fetch my dealt cards (with robust foreign key nested join)
  try {
    const { data: dbDealt, error: dealtErr } = await supabase
      .from('room_dealt_cards')
      .select('*, fluctuation_cards(*, companies(*))')
      .eq('room_id', gameState.room.id)
      .eq('player_id', gameState.me.id)
      .eq('round_number', gameState.room.current_round);
    
    if (dealtErr) throw dealtErr;
    gameState.myDealtCards = dbDealt ? dbDealt.map(dc => {
      const fc = dc.fluctuation_cards || {};
      const compObj = fc.companies || {};
      const ref = SEED_DATA.fluctuationCards.find(item => item.id === dc.card_id) || {};
      return {
        id: dc.card_id,
        company_id: fc.company_id || ref.company_id,
        company_symbol: compObj.symbol || ref.company_symbol,
        hint_text: fc.hint_text || ref.hint_text,
        fluctuation_percent: fc.fluctuation_percent !== undefined ? parseFloat(fc.fluctuation_percent) : ref.fluctuation_percent,
        ...dc
      };
    }) : [];

    // ⚡ Bulletproof Self-Healing: If game is active and dealt cards are empty, trigger a retry to fetch again (up to 10 attempts, 1 sec interval)
    if (gameState.myDealtCards.length === 0 && gameState.room && gameState.room.status === 'active' && gameState.room.current_round > 0) {
      if (!window.cardFetchRetryCount) window.cardFetchRetryCount = 0;
      if (window.cardFetchRetryCount < 10) {
        window.cardFetchRetryCount++;
        console.warn(`[Self-Healing Retry #${window.cardFetchRetryCount}] Dealt hint cards not found yet. Retrying in 1s...`);
        setTimeout(() => {
          refreshActiveGameUI();
        }, 1000);
      }
    } else {
      window.cardFetchRetryCount = 0;
    }
  } catch (err) {
    console.error("UI Sync: Error fetching my dealt cards:", err);
  }

  // 5. Fetch all dealt cards for Chairman
  try {
    const { data: dbDealtAll, error: dealtAllErr } = await supabase
      .from('room_dealt_cards')
      .select('*, fluctuation_cards(*, companies(*))')
      .eq('room_id', gameState.room.id)
      .eq('round_number', gameState.room.current_round);
    
    if (dealtAllErr) throw dealtAllErr;
    gameState.dealtCardsAll = dbDealtAll ? dbDealtAll.map(dc => {
      const fc = dc.fluctuation_cards || {};
      const compObj = fc.companies || {};
      const ref = SEED_DATA.fluctuationCards.find(item => item.id === dc.card_id) || {};
      const player = gameState.players.find(p => p.player_id === dc.player_id);
      return {
        id: dc.card_id,
        company_id: fc.company_id || ref.company_id,
        company_symbol: compObj.symbol || ref.company_symbol,
        hint_text: fc.hint_text || ref.hint_text,
        fluctuation_percent: fc.fluctuation_percent !== undefined ? parseFloat(fc.fluctuation_percent) : ref.fluctuation_percent,
        ...dc,
        owner_name: player ? player.username : "Player"
      };
    }) : [];
  } catch (err) {
    console.error("UI Sync: Error fetching all dealt cards:", err);
  }

  // 6. Fetch turns logs
  try {
    const { data: dbTurns, error: turnsErr } = await supabase.from('room_player_turns').select('*').eq('room_id', gameState.room.id).eq('round_number', gameState.room.current_round).eq('sub_round_number', gameState.room.current_sub_round);
    if (turnsErr) throw turnsErr;
    gameState.turnsStatus = dbTurns || [];
  } catch (err) {
    console.error("UI Sync: Error fetching turn logs:", err);
  }

  // ==========================================================
  // 10. BIND DATA TO DYNAMIC UI
  // ==========================================================
  const meState = gameState.players.find(p => p.player_id === gameState.me.id) || { cash: 1000000.00, loan_amount: 0.00 };

  // Update top header display
  safeSetText("round-indicator", `Round ${gameState.room.current_round} / ${gameState.room.total_rounds}`);
  safeSetText("game-market-name", gameState.room.stock_exchange);
  safeSetText("game-room-code-tag", `CODE: ${gameState.room.code}`);

  // Net Worth Calculation = cash + portfolio shares * current_price - short sell positions * current_price - loans
  let myPortfolioVal = 0;
  if (gameState.companies && Array.isArray(gameState.companies)) {
    gameState.companies.forEach(c => {
      const port = (gameState.portfolios && gameState.portfolios[c.id]) || { owned: 0, mortgaged: 0 };
      const price = (gameState.prices && gameState.prices[c.id]) || c.base_price;
      myPortfolioVal += ((port.owned || 0) + (port.mortgaged || 0)) * price;
    });
  }
  const netWorth = (meState.cash || 0) + myPortfolioVal - (meState.loan_amount || 0);

  safeSetText("header-networth", `Rs. ${netWorth.toLocaleString()}`);
  safeSetText("desk-cash", `Rs. ${meState.cash.toLocaleString()}`);
  safeSetText("desk-portfolio-value", `Rs. ${myPortfolioVal.toLocaleString()}`);

  // Dynamic Sub-round indicators
  const srDots = document.getElementById("subround-dots");
  if (srDots) {
    srDots.innerHTML = "";
    for (let i = 1; i <= 3; i++) {
      const dot = document.createElement("span");
      if (gameState.room.current_sub_round >= i) {
        dot.className = "w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm shadow-blue-500/30";
      } else {
        dot.className = "w-2.5 h-2.5 rounded-full bg-slate-200";
      }
      srDots.appendChild(dot);
    }
  }

  // Render Live Stock Exchange Watch List
  renderStockExchangeList();

  // Render Active Turn banner
  const activePlayer = gameState.players.find(p => p.player_id === gameState.room.current_turn_player_id);
  safeSetHtml("active-player-name", `
    <i class="fa-regular fa-user text-emerald-400"></i> ${activePlayer ? activePlayer.username : "Unknown"}
  `);

  // Officer Roles logic check
  computeOfficerRoles();

  // Update Outstanding Loan balance tracker
  safeSetText("desk-loans-due", "Rs. " + (meState.loan_amount || 0).toLocaleString());

  // Enable/disable rule toggles
  const panelShort = document.getElementById("panel-shortsell");
  if (panelShort) {
    if (gameState.room.short_sell_enabled) {
      panelShort.classList.remove("hidden");
    } else {
      panelShort.classList.add("hidden");
    }
  }

  const panelLoans = document.getElementById("panel-loans");
  if (panelLoans) {
    if (gameState.room.loan_mortgage_enabled) {
      panelLoans.classList.remove("hidden");
    } else {
      panelLoans.classList.add("hidden");
    }
  }

  // Render Turn Registry list
  renderTurnRegistryList();

  // Render Dealt Cards inside side hand
  renderDealtHintCards();

  // Render Portfolio Summary
  renderPortfolioSummary(myPortfolioVal);

  // 7. Check and trigger active player turn notifications
  const isMyTurn = gameState.me && gameState.room && gameState.me.id === gameState.room.current_turn_player_id;
  if (isMyTurn) {
    const turnKey = `${gameState.room.id}:${gameState.room.current_round}:${gameState.room.current_sub_round}:${gameState.room.current_turn_player_id}`;
    if (window.lastNotifiedTurnKey !== turnKey) {
      window.lastNotifiedTurnKey = turnKey;
      triggerTurnNotification();
    }
  } else {
    dismissTurnAlert();
  }
}

// ==========================================================
// 11. SUB-ROUND TURN MANAGERS & ACTIONS
// ==========================================================
function renderStockExchangeList() {
  const listDiv = document.getElementById("market-list");
  if (!listDiv) return;
  listDiv.innerHTML = "";

  gameState.companies.forEach(c => {
    const curPrice = gameState.prices[c.id] || c.base_price;
    const changeVal = curPrice - c.base_price;
    const changePercent = (changeVal / c.base_price) * 100;

    const isUp = changeVal >= 0;
    const colClass = isUp ? 'text-emerald-500 bg-emerald-50 border-emerald-100' : 'text-rose-500 bg-rose-50 border-rose-100';
    const caret = isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

    const row = document.createElement("div");
    row.className = "flex justify-between items-center bg-slate-50/50 hover:bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100 transition-colors";
    row.innerHTML = `
      <div>
        <h4 class="font-extrabold text-sm text-slate-800 tracking-tight">${c.symbol}</h4>
        <span class="text-[10px] text-slate-400 block max-w-[150px] truncate">${c.name}</span>
      </div>
      
      <!-- Mock sparkline graph using SVG -->
      <div class="hidden sm:block w-16 h-8">
        <svg viewBox="0 0 100 40" class="w-full h-full">
          <path d="M 0 ${isUp ? '30 Q 25 10, 50 25 T 100 10' : '10 Q 25 30, 50 15 T 100 35'}" fill="none" stroke="${isUp ? '#10b981' : '#ef4444'}" stroke-width="2.5" />
        </svg>
      </div>

      <div class="text-right">
        <strong class="text-slate-800 text-sm font-bold">Rs. ${curPrice.toLocaleString()}</strong>
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 mt-0.5 ${colClass}">
          <i class="fa-solid ${caret}"></i>
          ${isUp ? '+' : ''}${changePercent.toFixed(1)}%
        </span>
      </div>
    `;
    listDiv.appendChild(row);
  });
}

// Dynamic Turn status indicators
function renderTurnRegistryList() {
  const parent = document.getElementById("room-turn-registry");
  if (!parent) return;
  parent.innerHTML = "";

  gameState.players.forEach(p => {
    const isCurrent = p.player_id === gameState.room.current_turn_player_id;
    const turnLog = gameState.turnsStatus.find(ts => ts.player_id === p.player_id);

    let statusBadge = "";
    if (isCurrent) {
      statusBadge = '<span class="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1"><i class="fa-solid fa-circle-notch animate-spin text-[8px]"></i> Active Turn</span>';
    } else if (turnLog) {
      if (turnLog.trade_made) {
        statusBadge = '<span class="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1"><i class="fa-solid fa-check text-[8px]"></i> Played (Traded)</span>';
      } else {
        statusBadge = '<span class="text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1"><i class="fa-solid fa-forward text-[8px]"></i> Played (Passed)</span>';
      }
    } else {
      statusBadge = '<span class="text-[10px] font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Pending ⚪</span>';
    }

    const item = document.createElement("div");
    item.className = `flex justify-between items-center py-2 px-2.5 rounded-lg border ${isCurrent ? 'bg-blue-50/20 border-blue-100' : 'border-transparent'}`;
    item.innerHTML = `
      <span class="text-xs font-semibold ${isCurrent ? 'text-slate-800' : 'text-slate-500'}">${p.username}</span>
      ${statusBadge}
    `;
    parent.appendChild(item);
  });
}

// Dynamic officer role visual badge calculator
let myRoles = { isChairman: false, isCeo: false, chairmanCompanyId: null, ceoCompanyId: null };

function computeOfficerRoles() {
  myRoles = { isChairman: false, isCeo: false, chairmanCompanyId: null, ceoCompanyId: null };

  const badgeContainer = document.getElementById("active-player-role-badges");
  badgeContainer.innerHTML = "";

  if (!gameState.room.chairman_ceo_enabled) return;

  // In multi-device, compute officers from all player portfolios
  gameState.companies.forEach(c => {
    // Find all portfolios for company c
    const companyPortfolios = (gameState.allPortfolios || []).filter(item => item.company_id === c.id);

    // Sort by shares_owned DESC
    companyPortfolios.sort((a, b) => b.shares_owned - a.shares_owned);

    const first = companyPortfolios[0];
    const second = companyPortfolios[1];

    const highestShares = first ? first.shares_owned : 0;
    const highestPlayerId = first ? first.player_id : null;

    const secondShares = second ? second.shares_owned : 0;
    const secondPlayerId = second ? second.player_id : null;

    // Chairman Check (100k shares + rank 1)
    if (highestPlayerId && highestShares >= 100000) {
      if (highestPlayerId === gameState.me.id) {
        myRoles.isChairman = true;
        myRoles.chairmanCompanyId = c.id;
      }
      if (gameState.room.current_turn_player_id === highestPlayerId) {
        badgeContainer.innerHTML += `<span class="bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-200 shadow-sm flex items-center gap-1"><i class="fa-solid fa-medal"></i> ${c.symbol} Chairman</span>`;
      }
    }

    // CEO Check (50k shares + rank 2 or rank 1 with 50k-99.9k)
    if (highestPlayerId && highestShares >= 50000 && highestShares < 100000) {
      if (highestPlayerId === gameState.me.id) {
        myRoles.isCeo = true;
        myRoles.ceoCompanyId = c.id;
      }
      if (gameState.room.current_turn_player_id === highestPlayerId) {
        badgeContainer.innerHTML += `<span class="bg-indigo-100 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-indigo-200 shadow-sm flex items-center gap-1"><i class="fa-solid fa-briefcase"></i> ${c.symbol} CEO</span>`;
      }
    } else if (secondPlayerId && secondShares >= 50000) {
      if (secondPlayerId === gameState.me.id) {
        myRoles.isCeo = true;
        myRoles.ceoCompanyId = c.id;
      }
      if (gameState.room.current_turn_player_id === secondPlayerId) {
        badgeContainer.innerHTML += `<span class="bg-indigo-100 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-indigo-200 shadow-sm flex items-center gap-1"><i class="fa-solid fa-briefcase"></i> ${c.symbol} CEO</span>`;
      }
    }
  });
}

// Executes action for turn player
async function executeTrade(coId, shares, type) {
  // 1. Validate turns
  const isMyTurn = gameState.me.id === gameState.room.current_turn_player_id;
  if (!isMyTurn) {
    triggerToast("Not Your Turn", "Wait for the active trading player to finish their sub-round actions.", true);
    return;
  }

  // Check if already acted
  const alreadyActed = gameState.turnsStatus.some(t => t.player_id === gameState.me.id && t.has_acted);
  if (alreadyActed) {
    triggerToast("Action Limited", "You have already made a trade or passed in this sub-round.", true);
    return;
  }

  const comp = gameState.companies.find(c => c.id === coId);
  if (!comp) return;
  const price = gameState.prices[coId] || comp.base_price;
  const total = price * shares;

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const port = gameState.portfolios[coId] || { owned: 0, mortgaged: 0 };

  // Balance checks
  if (type === 'BUY') {
    if (meState.cash < total) {
      triggerToast("Insufficient Funds", "You do not have enough cash to complete this purchase.", true);
      return;
    }
  } else if (type === 'SELL') {
    if (port.owned < shares) {
      triggerToast("Insufficient Holdings", "You do not own enough unmortgaged shares to sell this volume.", true);
      return;
    }
  } else if (type === 'SHORT_SELL') {
    if (port.owned < 0 && Math.abs(port.owned - shares) > 500000) {
      triggerToast("Short Sell Limit", "Maximum short sold position is 500,000 shares.", true);
      return;
    }
  } else if (type === 'SHORT_COVER') {
    if (port.owned >= 0) {
      triggerToast("No Position to Cover", "You do not have any active short position to cover.", true);
      return;
    }
    if (meState.cash < total) {
      triggerToast("Insufficient Funds", "Not enough cash to buy back short shares.", true);
      return;
    }
  }

  // Live Supabase Mode Transaction SQL Actions
  try {
    let cashChange = 0;
    let shareChange = 0;

    if (type === 'BUY') {
      cashChange = -total;
      shareChange = shares;
    } else if (type === 'SELL') {
      cashChange = total;
      shareChange = -shares;
    } else if (type === 'SHORT_SELL') {
      cashChange = total;
      shareChange = -shares;
    } else if (type === 'SHORT_COVER') {
      cashChange = -total;
      shareChange = shares;
    }

    // Update player cash
    const { error: cashErr } = await supabase.from('room_players').update({ cash: meState.cash + cashChange }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    if (cashErr) throw cashErr;

    // Update portfolio
    const { data: currentPort, error: portFetchErr } = await supabase.from('room_portfolios').select('*').eq('room_id', gameState.room.id).eq('player_id', gameState.me.id).eq('company_id', coId).single();
    if (portFetchErr && portFetchErr.code !== 'PGRST116') throw portFetchErr;

    if (currentPort) {
      const { error: portUpErr } = await supabase.from('room_portfolios').update({ shares_owned: currentPort.shares_owned + shareChange }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id).eq('company_id', coId);
      if (portUpErr) throw portUpErr;
    } else {
      const { error: portInsErr } = await supabase.from('room_portfolios').insert({
        room_id: gameState.room.id,
        player_id: gameState.me.id,
        company_id: coId,
        shares_owned: shareChange
      });
      if (portInsErr) throw portInsErr;
    }

    // Insert Transaction
    const { error: txErr } = await supabase.from('transactions').insert({
      room_id: gameState.room.id,
      player_id: gameState.me.id,
      company_id: coId,
      round_number: gameState.room.current_round,
      sub_round_number: gameState.room.current_sub_round,
      transaction_type: type,
      shares_count: shares,
      share_price: price,
      total_amount: total
    });
    if (txErr) throw txErr;

    // Insert turn complete indicator
    const { error: turnErr } = await supabase.from('room_player_turns').insert({
      room_id: gameState.room.id,
      player_id: gameState.me.id,
      round_number: gameState.room.current_round,
      sub_round_number: gameState.room.current_sub_round,
      has_acted: true,
      trade_made: true
    });
    if (turnErr) throw turnErr;

    triggerToast("Trade Confirmed", `Direct database ledger update complete.`);
    await advanceSubRoundTurns();

  } catch (err) {
    triggerToast("Transaction Fail", err.message, true);
  }
}

async function executePass() {
  const isMyTurn = gameState.me.id === gameState.room.current_turn_player_id;
  if (!isMyTurn) {
    triggerToast("Not Your Turn", "Wait for the active player to pass.", true);
    return;
  }

  const alreadyActed = gameState.turnsStatus.some(t => t.player_id === gameState.me.id && t.has_acted);
  if (alreadyActed) {
    triggerToast("Action Limited", "You have already completed actions for this sub-round.", true);
    return;
  }

  try {
    const { error: passErr } = await supabase.from('room_player_turns').insert({
      room_id: gameState.room.id,
      player_id: gameState.me.id,
      round_number: gameState.room.current_round,
      sub_round_number: gameState.room.current_sub_round,
      has_acted: true,
      trade_made: false
    });
    if (passErr) throw passErr;
    await advanceSubRoundTurns();
  } catch (err) {
    console.error("Pass action failed:", err);
    triggerToast("Pass Action Failed", err.message, true);
  }
}

// ==========================================================
// 12. ROTATE TURNS & SUB-ROUND ADVANCEMENTS
// ==========================================================
async function advanceSubRoundTurns() {
  // Find next player index in order rotation
  const order = gameState.room.turn_order;
  const curIdx = order.indexOf(gameState.room.current_turn_player_id);

  const nextIdx = curIdx + 1;

  try {
    if (nextIdx < order.length) {
      // Just advance to the next player's turn
      const nextPlayerId = order[nextIdx];

      const { error: roomUpErr } = await supabase.from('rooms').update({ current_turn_player_id: nextPlayerId }).eq('id', gameState.room.id);
      if (roomUpErr) throw roomUpErr;
    } else {
      // Everyone has acted in the sub-round!
      // Check if we need to advance the sub-round count or end the main round
      const currentSub = gameState.room.current_sub_round;

      if (currentSub < 3) {
        // Advance sub-round, reset turn rotation to first player
        const nextSub = currentSub + 1;
        const firstPlayerId = order[0];

        const { error: roomUpErr } = await supabase.from('rooms').update({
          current_sub_round: nextSub,
          current_turn_player_id: firstPlayerId
        }).eq('id', gameState.room.id);
        if (roomUpErr) throw roomUpErr;
        
        triggerToast(`Sub-Round ${nextSub} Begun`, "All players reset for next trade.");
      } else {
        // sub-round == 3 finished!
        // MAIN ROUND TRANSITION PROCESS BEGUN
        triggerRoundEndTransition();
      }
    }
  } catch (err) {
    console.error("Turn rotation failed:", err);
    triggerToast("Turn Rotation Failed", err.message, true);
  }
}

// ==========================================================
// 13. OFFICER ACTIONS (VETO / DISCARD Event Hints)
// ==========================================================
async function executeOfficerDiscard(dbCardId, role) {
  try {
    const { error: discardErr } = await supabase.from('room_dealt_cards').update({
      is_discarded: true,
      discarded_by_role: role
    }).eq('id', dbCardId);
    if (discardErr) throw discardErr;

    triggerToast("Veto Executed", `Card successfully discarded from database pool.`);
  } catch (err) {
    console.error("Veto failed:", err);
    triggerToast("Veto Failed", err.message, true);
  }
}

// ==========================================================
// 14. ADVANCED LOANS & MORTGAGES SYSTEMS
// ==========================================================
function handleTakeLoan() {
  openLoanModal();
}

let activeLoanModalTenure = 1;

function openLoanModal() {
  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const outstandingDebt = meState ? (meState.loan_amount || 0) : 0;
  const remainingCapacity = Math.max(0, 1000000 - outstandingDebt);

  // Set active debt & remaining capacity
  const activeDebtEl = document.getElementById("loan-modal-active-debt");
  const remainingLimitEl = document.getElementById("loan-modal-remaining-limit");
  if (activeDebtEl) activeDebtEl.textContent = `Rs. ${outstandingDebt.toLocaleString()}`;
  if (remainingLimitEl) remainingLimitEl.textContent = `Rs. ${remainingCapacity.toLocaleString()}`;

  // Reset/Set initial inputs
  const qtyInput = document.getElementById("loan-modal-qty");
  if (qtyInput) {
    qtyInput.value = Math.min(200000, remainingCapacity);
    qtyInput.max = remainingCapacity;
  }

  // Set default tenure to 1 round
  selectLoanTenure(1);

  // Show modal
  const modal = document.getElementById("loan-popup-modal");
  if (modal) modal.classList.remove("hidden");

  // Calculate initial estimates
  updateLoanEstimation();
}

function closeLoanModal() {
  const modal = document.getElementById("loan-popup-modal");
  if (modal) modal.classList.add("hidden");
}

function adjustLoanAmount(delta) {
  const qtyInput = document.getElementById("loan-modal-qty");
  if (!qtyInput) return;

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const outstandingDebt = meState ? (meState.loan_amount || 0) : 0;
  const remainingCapacity = Math.max(0, 1000000 - outstandingDebt);

  let amount = parseInt(qtyInput.value) || 0;
  amount += delta;

  if (amount < 50000) amount = 50000;
  if (amount > remainingCapacity) amount = remainingCapacity;

  qtyInput.value = amount;
  updateLoanEstimation();
}

function setLoanPreset(preset) {
  const qtyInput = document.getElementById("loan-modal-qty");
  if (!qtyInput) return;

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const outstandingDebt = meState ? (meState.loan_amount || 0) : 0;
  const remainingCapacity = Math.max(0, 1000000 - outstandingDebt);

  if (preset === 'MAX') {
    qtyInput.value = remainingCapacity;
  } else {
    let val = parseInt(preset) || 200000;
    if (val > remainingCapacity) val = remainingCapacity;
    if (val < 50000) val = 50000;
    qtyInput.value = val;
  }
  updateLoanEstimation();
}

function selectLoanTenure(rounds) {
  activeLoanModalTenure = rounds;

  // Toggle active button style
  for (let r = 1; r <= 4; r++) {
    const pill = document.getElementById(`tenure-pill-${r}`);
    if (pill) {
      if (r === rounds) {
        pill.className = "py-2 text-[10px] rounded-lg font-bold border transition duration-200 bg-amber-600 border-amber-600 text-white shadow-sm";
      } else {
        pill.className = "py-2 text-[10px] rounded-lg font-bold border transition duration-200 bg-white border-slate-200 hover:border-slate-300 text-slate-600";
      }
    }
  }

  updateLoanEstimation();
}

function updateLoanEstimation() {
  const qtyInput = document.getElementById("loan-modal-qty");
  if (!qtyInput) return;

  let amount = parseInt(qtyInput.value) || 0;
  if (amount < 0) amount = 0;

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const outstandingDebt = meState ? (meState.loan_amount || 0) : 0;
  const remainingCapacity = Math.max(0, 1000000 - outstandingDebt);

  // Math calculation
  const interestRate = 0.12 * activeLoanModalTenure;
  const interestAmount = amount * interestRate;
  const totalRepayment = amount + interestAmount;

  // Update elements
  const principalEl = document.getElementById("loan-est-principal");
  const rateEl = document.getElementById("loan-est-rate");
  const interestEl = document.getElementById("loan-est-interest");
  const repayEl = document.getElementById("loan-est-repay");

  if (principalEl) principalEl.textContent = `Rs. ${amount.toLocaleString()}`;
  if (rateEl) rateEl.textContent = `${activeLoanModalTenure} Round${activeLoanModalTenure > 1 ? 's' : ''} @ 12% (${(interestRate * 100).toFixed(0)}%)`;
  if (interestEl) interestEl.textContent = `Rs. ${interestAmount.toLocaleString()}`;
  if (repayEl) repayEl.textContent = `Rs. ${totalRepayment.toLocaleString()}`;

  // Update status messages
  const statusEl = document.getElementById("loan-modal-status-text");
  const actionBtn = document.getElementById("btn-modal-action-loan");
  if (statusEl && actionBtn) {
    if (amount > remainingCapacity) {
      statusEl.innerHTML = `<span class="text-rose-500 font-bold">⚠️ Exceeds remaining credit capacity of Rs. ${remainingCapacity.toLocaleString()}</span>`;
      actionBtn.disabled = true;
      actionBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else if (amount === 0) {
      statusEl.innerHTML = `<span class="text-slate-400 font-medium">Enter a positive amount to borrow</span>`;
      actionBtn.disabled = true;
      actionBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else {
      statusEl.innerHTML = `<span class="text-emerald-600 font-medium">✓ Disbursal Pre-Approved (Immediate Disbursal: +Rs. ${amount.toLocaleString()})</span>`;
      actionBtn.disabled = false;
      actionBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }
}

async function submitLoanApplication() {
  const qtyInput = document.getElementById("loan-modal-qty");
  if (!qtyInput) return;

  const amount = parseInt(qtyInput.value) || 0;
  if (amount <= 0) {
    triggerToast("Invalid Amount", "Please enter a valid borrowing amount.", true);
    return;
  }

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const currentDebt = meState ? (meState.loan_amount || 0) : 0;

  if (currentDebt + amount > 1000000) {
    triggerToast("Loan Limit Exceeded", "Maximum cumulative leverage allowed is Rs. 10 Lakh.", true);
    return;
  }

  try {
    // 1. Update room_players details
    const { error: playerUpErr } = await supabase.from('room_players').update({
      cash: meState.cash + amount,
      loan_amount: meState.loan_amount + amount,
      loan_taken_round: activeLoanModalTenure
    }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    
    if (playerUpErr) throw playerUpErr;

    // 2. Insert TAKE_LOAN transaction
    const { error: txErr } = await supabase.from('transactions').insert({
      room_id: gameState.room.id,
      player_id: gameState.me.id,
      transaction_type: 'TAKE_LOAN',
      total_amount: amount
    });
    if (txErr) throw txErr;

    triggerToast("Leverage Success", `Rs. ${amount.toLocaleString()} disbursed directly from bank with ${activeLoanModalTenure} Round tenure.`);
    closeLoanModal();
  } catch (err) {
    console.error("Loan disbursal failed:", err);
    triggerToast("Loan Disbursal Failed", err.message, true);
  }
}

async function handleMortgageAssets(coId) {
  const comp = gameState.companies.find(c => c.id === coId);
  if (!comp) return;
  const port = gameState.portfolios[coId] || { owned: 0, mortgaged: 0 };

  if (port.owned < 10000) {
    triggerToast("Invalid Volume", "You need at least 10,000 shares of a company to create a mortgage pool.", true);
    return;
  }

  // Mortgage calculation: 60% of current stock value
  const price = gameState.prices[coId] || comp.base_price;
  const mortgagePayout = price * 10000 * 0.60;

  try {
    const meState = gameState.players.find(p => p.player_id === gameState.me.id);

    // 1. Move shares to mortgage
    const { error: portUpErr } = await supabase.from('room_portfolios').update({
      shares_owned: port.owned - 10000,
      shares_mortgaged: port.mortgaged + 10000
    }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id).eq('company_id', coId);
    if (portUpErr) throw portUpErr;

    // 2. Disburse cash and update loan record
    const { error: playerUpErr } = await supabase.from('room_players').update({
      cash: meState.cash + mortgagePayout,
      loan_amount: meState.loan_amount + mortgagePayout
    }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    if (playerUpErr) throw playerUpErr;

    const { error: txErr } = await supabase.from('transactions').insert({
      room_id: gameState.room.id,
      player_id: gameState.me.id,
      company_id: coId,
      transaction_type: 'MORTGAGE',
      shares_count: 10000,
      total_amount: mortgagePayout
    });
    if (txErr) throw txErr;

    triggerToast("Assets Mortgaged", "Cash added. Shares locked under bank custody.");

  } catch (err) {
    console.error("Mortgage assets failed:", err);
    triggerToast("Mortgage Failed", err.message, true);
  }
}

async function settleAllDebts() {
  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const interestRate = meState.loan_taken_round > 0 ? (0.12 * meState.loan_taken_round) : 0.12;
  const debtTotal = meState.loan_amount * (1 + interestRate);

  if (meState.cash < debtTotal) {
    triggerToast("Insufficient Capital", `You do not have enough cash to settle your loans + ${(interestRate * 100).toFixed(0)}% interest.`, true);
    return;
  }

  try {
    // Live Supabase repay
    const { error: playerUpErr } = await supabase.from('room_players').update({
      cash: meState.cash - debtTotal,
      loan_amount: 0.00
    }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    if (playerUpErr) throw playerUpErr;

    // Move mortgaged shares back to owned
    const { data: ports, error: portFetchErr } = await supabase.from('room_portfolios').select('*').eq('room_id', gameState.room.id).eq('player_id', gameState.me.id);
    if (portFetchErr) throw portFetchErr;
    
    for (const item of ports) {
      if (item.shares_mortgaged > 0) {
        const { error: portUpErr } = await supabase.from('room_portfolios').update({
          shares_owned: item.shares_owned + item.shares_mortgaged,
          shares_mortgaged: 0
        }).eq('room_id', gameState.room.id).eq('player_id', gameState.me.id).eq('company_id', item.company_id);
        if (portUpErr) throw portUpErr;
      }
    }

    triggerToast("Debt Repaid", "Accounts cleared successfully.");
    document.getElementById("settlement-loan-section").classList.add("hidden");
  } catch (err) {
    console.error("Debt settlement failed:", err);
    triggerToast("Debt Settlement Failed", err.message, true);
  }
}

// ==========================================================
// 15. MAIN ROUND END TRANSITIONS & CALCULATION ENGINE
// ==========================================================
let netFluctuations = {};

async function triggerRoundEndTransition() {
  try {
    // 1. Calculate price adjustments according to active (non-vetoed) fluctuation hint cards
    const activeDealt = gameState.dealtCardsAll.filter(dc => !dc.is_discarded);

    netFluctuations = {};
    gameState.companies.forEach(c => {
      netFluctuations[c.id] = { percent: 0, triggers: [] };
    });

    activeDealt.forEach(dc => {
      if (netFluctuations[dc.company_id]) {
        netFluctuations[dc.company_id].percent += parseFloat(dc.fluctuation_percent);
        netFluctuations[dc.company_id].triggers.push(`${dc.owner_name}'s card: ${dc.hint_text} (${dc.fluctuation_percent > 0 ? '+' : ''}${dc.fluctuation_percent}%)`);
      }
    });

    // Render Modal summary items
    const summaryList = document.getElementById("fluctuation-summary-list");
    summaryList.innerHTML = "";

    // Also compute new prices
    let updatedPrices = {};
    gameState.companies.forEach(c => {
      const curPrice = gameState.prices[c.id] || c.base_price;
      const fluc = netFluctuations[c.id];
      const newPrice = Math.max(10, curPrice * (1 + fluc.percent / 100)); // Minimum price cap to prevent negative/zero value
      updatedPrices[c.id] = newPrice;

      const row = document.createElement("div");
      row.className = "p-3 bg-white rounded-lg border border-slate-100 flex flex-col gap-1";
      row.innerHTML = `
        <div class="flex justify-between items-center text-xs">
          <span class="font-extrabold text-slate-800">${c.symbol}</span>
          <span class="font-bold text-sm text-slate-800">Rs. ${curPrice.toLocaleString()} <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-slate-400"></i> <span class="${fluc.percent >= 0 ? 'text-emerald-500' : 'text-rose-500'}">Rs. ${newPrice.toLocaleString()}</span></span>
        </div>
        <div class="text-[10px] text-slate-400">
          Event triggers: ${fluc.triggers.length > 0 ? fluc.triggers.join(', ') : 'None (No active fluctuation cards dealt)'}
        </div>
      `;
      summaryList.appendChild(row);
    });

    // Check loan balances for local player
    const meState = gameState.players.find(p => p.player_id === gameState.me.id);
    const loanSection = document.getElementById("settlement-loan-section");

    if (gameState.room.loan_mortgage_enabled && meState && meState.loan_amount > 0) {
      loanSection.classList.remove("hidden");
      const interestRate = meState.loan_taken_round > 0 ? (0.12 * meState.loan_taken_round) : 0.12;
      document.getElementById("settlement-loan-amount").textContent = `Rs. ${(meState.loan_amount * (1 + interestRate)).toLocaleString()}`;

      let mortgageSum = 0;
      gameState.companies.forEach(c => {
        const port = gameState.portfolios[c.id] || { mortgaged: 0 };
        mortgageSum += port.mortgaged;
      });
      document.getElementById("settlement-mortgage-count").textContent = `${mortgageSum.toLocaleString()} Shares`;
    } else {
      loanSection.classList.add("hidden");
    }

    // 2. Perform price updates in DB
    for (const cId in updatedPrices) {
      const { error: priceUpErr } = await supabase
        .from('room_company_prices')
        .update({ current_price: updatedPrices[cId] })
        .eq('room_id', gameState.room.id)
        .eq('company_id', cId);
      if (priceUpErr) throw priceUpErr;
    }

    // Display Modal
    document.getElementById("round-settlement-modal").classList.remove("hidden");
  } catch (err) {
    console.error("Round end transition failed:", err);
    triggerToast("Round Transition Failed", err.message, true);
  }
}

async function closeSettlementModal(forcedLiquidation = false) {
  document.getElementById("round-settlement-modal").classList.add("hidden");

  try {
    const meState = gameState.players.find(p => p.player_id === gameState.me.id);

    // Auto-liquidation logic execution
    if (forcedLiquidation && meState && meState.loan_amount > 0) {
      const interestRate = meState.loan_taken_round > 0 ? (0.12 * meState.loan_taken_round) : 0.12;
      const debtTotal = meState.loan_amount * (1 + interestRate);

      // Liquidate mortgaged shares
      let totalLiquidationValue = 0;

      // Live Supabase Liquidation
      const { data: ports, error: portsErr } = await supabase
        .from('room_portfolios')
        .select('*')
        .eq('room_id', gameState.room.id)
        .eq('player_id', gameState.me.id);
      if (portsErr) throw portsErr;

      const { data: dbPrices, error: pricesErr } = await supabase
        .from('room_company_prices')
        .select('*')
        .eq('room_id', gameState.room.id);
      if (pricesErr) throw pricesErr;

      if (ports && dbPrices) {
        for (const item of ports) {
          if (item.shares_mortgaged > 0) {
            const priceObj = dbPrices.find(cp => cp.company_id === item.company_id);
            const compPrice = priceObj ? parseFloat(priceObj.current_price) : 100;
            totalLiquidationValue += item.shares_mortgaged * compPrice;

            const { error: portUpErr } = await supabase
              .from('room_portfolios')
              .update({ shares_mortgaged: 0 })
              .eq('room_id', gameState.room.id)
              .eq('player_id', gameState.me.id)
              .eq('company_id', item.company_id);
            if (portUpErr) throw portUpErr;
          }
        }
      }

      const { error: playerUpErr } = await supabase
        .from('room_players')
        .update({
          cash: meState.cash + totalLiquidationValue - debtTotal,
          loan_amount: 0.00
        })
        .eq('room_id', gameState.room.id)
        .eq('player_id', gameState.me.id);
      if (playerUpErr) throw playerUpErr;

      triggerToast("Forced Settlement Complete", "Lien liquidation processed.");
    }

    // Check if it is host's duty to increment the round
    const isHost = gameState.me.id === gameState.room.host_id;
    if (isHost) {
      const nextRound = gameState.room.current_round + 1;

      if (nextRound <= gameState.room.total_rounds) {
        // Live Supabase round increment
        const { error: roomUpErr } = await supabase
          .from('rooms')
          .update({
            current_round: nextRound,
            current_sub_round: 1,
            current_turn_player_id: gameState.room.turn_order[0]
          })
          .eq('id', gameState.room.id);
        if (roomUpErr) throw roomUpErr;

        const { error: turnsDelErr } = await supabase
          .from('room_player_turns')
          .delete()
          .eq('room_id', gameState.room.id);
        if (turnsDelErr) throw turnsDelErr;

        await dealMainRoundCards(nextRound);
        triggerToast(`Round ${nextRound} Started`, "Banker has dealt 10 new cards to everyone.");
      } else {
        // Finished Game!
        const { error: roomFinishErr } = await supabase
          .from('rooms')
          .update({ status: 'finished' })
          .eq('id', gameState.room.id);
        if (roomFinishErr) throw roomFinishErr;
      }
    }
  } catch (err) {
    console.error("Settlement modal closure / round increment failed:", err);
    triggerToast("Action Failed", err.message, true);
  }
}

// ==========================================================
// 16. LEADERBOARDS & FINAL WORTH STATISTICS
// ==========================================================
function triggerGameOver() {
  unsubscribeLobby();
  if (gameSubscription) {
    supabase.removeChannel(gameSubscription);
    gameSubscription = null;
  }
  activeSubscriptionRoomId = null;

  const parent = document.getElementById("leaderboard-standings");
  parent.innerHTML = "";

  let standings = [];
  gameState.players.forEach(p => {
    // Calculate worth
    let val = 0;

    // Use gameState.allPortfolios to calculate worth for ALL players
    const userPortfolios = (gameState.allPortfolios || []).filter(item => item.player_id === p.player_id);
    userPortfolios.forEach(port => {
      const price = gameState.prices[port.company_id] || 100; // Fallback
      val += (port.shares_owned + port.shares_mortgaged) * price;
    });

    const net = p.cash + val - p.loan_amount;
    standings.push({ username: p.username, net: net });
  });

  // Sort DESC
  standings.sort((a, b) => b.net - a.net);

  standings.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = `flex justify-between items-center p-3 rounded-xl border ${idx === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-100'}`;
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${idx === 0 ? 'bg-yellow-400 text-white' : 'bg-slate-200 text-slate-600'}">${idx + 1}</span>
        <span class="font-semibold text-slate-800 text-sm">${s.username}</span>
      </div>
      <strong class="${idx === 0 ? 'text-amber-600' : 'text-slate-800'} text-sm">Rs. ${s.net.toLocaleString()}</strong>
    `;
    parent.appendChild(row);
  });

  document.getElementById("game-over-modal").classList.remove("hidden");
}

function exitToMainMenu() {
  document.getElementById("game-over-modal").classList.add("hidden");
  showScreen("menu-screen");
}

// ==========================================================
// 17. TICKET RENDERING HAND DRAWERS
// ==========================================================
function renderDealtHintCards() {
  const container = document.getElementById("dealt-cards-container");
  const empty = document.getElementById("empty-cards-state");
  const countBadge = document.getElementById("hint-deck-count");

  if (!container) return;
  container.innerHTML = "";

  if (gameState.myDealtCards.length === 0) {
    if (empty) empty.classList.remove("hidden");
    if (countBadge) countBadge.textContent = "0 / 10";
    return;
  }

  if (empty) empty.classList.add("hidden");
  if (countBadge) countBadge.textContent = `${gameState.myDealtCards.length} Cards`;

  // Check if it is currently my turn and I have not acted yet in this sub-round
  const isMyTurn = gameState.me.id === gameState.room.current_turn_player_id;
  const alreadyActed = gameState.turnsStatus.some(t => t.player_id === gameState.me.id && t.has_acted);
  const canTrade = isMyTurn && !alreadyActed;

  gameState.myDealtCards.forEach(c => {
    const isUp = parseFloat(c.fluctuation_percent) > 0;
    const color = isUp ? 'bg-emerald-600' : 'bg-rose-600';
    const cardBorder = isUp ? 'border-emerald-200 hover:border-emerald-400' : 'border-rose-200 hover:border-rose-400';

    const isVetoed = c.is_discarded;

    const card = document.createElement("div");
    card.className = `ticket-card border-2 ${cardBorder} p-3 select-none flex flex-col justify-between min-h-[180px] w-full relative jagged-bottom pb-4 transition-all duration-300 ${canTrade && !isVetoed ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''}`;

    if (canTrade && !isVetoed) {
      card.setAttribute("onclick", `if(event.target.closest('button')) return; openTradingModal('${c.company_id}')`);
    }

    // Veto button for Officers
    let discardBtn = "";
    if (gameState.room.chairman_ceo_enabled) {
      // If Chairman of this company: can discard from ANY deck (i.e. my hand or anyone else's)
      // If CEO of this company: can discard from OWN deck
      const isMyChairman = myRoles.isChairman && myRoles.chairmanCompanyId === c.company_id;
      const isMyCeo = myRoles.isCeo && myRoles.ceoCompanyId === c.company_id;

      if (!c.is_discarded && !isUp) {
        if (isMyChairman) {
          discardBtn = `<button onclick="executeOfficerDiscard('${c.id}', 'CHAIRMAN')" class="absolute top-2 right-2 bg-slate-900 text-white rounded px-2 py-0.5 text-[9px] hover:bg-slate-700 transition shadow" title="Veto Card"><i class="fa-solid fa-ban text-[8px] text-amber-400 mr-1"></i> Chairman Veto</button>`;
        } else if (isMyCeo) {
          discardBtn = `<button onclick="executeOfficerDiscard('${c.id}', 'CEO')" class="absolute top-2 right-2 bg-slate-900 text-white rounded px-2 py-0.5 text-[9px] hover:bg-slate-700 transition shadow" title="Veto Card"><i class="fa-solid fa-ban text-[8px] text-indigo-400 mr-1"></i> CEO Veto</button>`;
        }
      }
    }

    card.innerHTML = `
      <!-- Top bar -->
      <div class="h-6 -mx-3 -mt-3 flex items-center px-3 text-[9px] font-bold text-white tracking-widest ${color} uppercase flex justify-between">
        <span>Stock Market</span>
        ${isVetoed ? '<span class="bg-black text-[8px] px-1 rounded text-slate-300">DISCARDED</span>' : ''}
      </div>
      
      ${discardBtn}
      
      <div class="flex-grow flex flex-col justify-center items-center text-center py-2 ${isVetoed ? 'line-through opacity-40' : ''}">
        <!-- Vector Graph -->
        <div class="text-3xl mb-1 ${isUp ? 'text-emerald-500' : 'text-rose-500'}">
          <i class="fa-solid ${isUp ? 'fa-chart-line' : 'fa-chart-line-down'}"></i>
        </div>
        
        <strong class="text-sm font-extrabold ${isUp ? 'text-emerald-600' : 'text-rose-600'}">
          ${isUp ? '+' : ''}Rs. ${(c.fluctuation_percent * 2.5).toFixed(0)}/- (${c.fluctuation_percent}%)
        </strong>
        <p class="text-[9px] font-bold text-slate-600 uppercase mt-0.5 max-w-[90%] truncate">${c.hint_text}</p>
      </div>
      
      <!-- Bottom Exchange label -->
      <div class="text-[9px] font-extrabold text-blue-900 border-t border-slate-100 pt-1.5 flex justify-between items-center ${isVetoed ? 'opacity-30' : ''}">
        <span>${c.company_symbol}</span>
        ${canTrade && !isVetoed ? `
          <span class="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold border border-emerald-200 animate-pulse">
            <i class="fa-solid fa-hand-pointer mr-0.5"></i> Tap to Trade
          </span>
        ` : `
          <span class="text-[7px] text-slate-400 font-normal">Round ${c.round_number}</span>
        `}
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================================
// 17b. PREMIUM INTERACTIVE TRADING MODAL CONTROLLER
// ==========================================================
let modalSelectedCompanyId = null;

function openTradingModal(companyId) {
  const comp = gameState.companies.find(c => c.id === companyId);
  if (!comp) return;

  modalSelectedCompanyId = companyId;

  const price = gameState.prices[companyId] || comp.base_price;
  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const port = gameState.portfolios[companyId] || { owned: 0, mortgaged: 0 };
  const currentCash = meState ? meState.cash : 0;

  // Set company header
  const coSymbolEl = document.getElementById("trading-modal-co-symbol");
  if (coSymbolEl) coSymbolEl.textContent = comp.symbol;

  const coNameEl = document.getElementById("trading-modal-co-name");
  if (coNameEl) coNameEl.textContent = comp.name;

  const livePriceEl = document.getElementById("trading-modal-live-price");
  if (livePriceEl) livePriceEl.textContent = `Rs. ${price.toLocaleString()}`;

  // Set portfolio status
  const cashEl = document.getElementById("trading-modal-cash");
  if (cashEl) cashEl.textContent = `Rs. ${currentCash.toLocaleString()}`;
  
  const posEl = document.getElementById("trading-modal-position");
  if (posEl) {
    let positionText = `${port.owned.toLocaleString()} Shares`;
    if (port.owned < 0) {
      positionText = `${Math.abs(port.owned).toLocaleString()} Shares (Short)`;
    }
    posEl.textContent = positionText;
  }

  // Set default quantity
  const qtyInput = document.getElementById("trading-modal-qty");
  if (qtyInput) qtyInput.value = 10000;

  // Toggle short sell actions visibility
  const shortSection = document.getElementById("modal-short-sell-actions");
  if (shortSection) {
    if (gameState.room.short_sell_enabled) {
      shortSection.classList.remove("hidden");
    } else {
      shortSection.classList.add("hidden");
    }
  }

  // Show modal
  const modal = document.getElementById("trading-popup-modal");
  if (modal) modal.classList.remove("hidden");
  
  // Calculate estimation
  updateTradingModalEstimation();
}

function closeTradingModal() {
  const modal = document.getElementById("trading-popup-modal");
  modal.classList.add("hidden");
  modalSelectedCompanyId = null;
}

function adjustModalQuantity(delta) {
  const qtyInput = document.getElementById("trading-modal-qty");
  let qty = parseInt(qtyInput.value) || 0;
  qty += delta;
  if (qty < 1000) qty = 1000;
  qtyInput.value = qty;
  updateTradingModalEstimation();
}

function setPresetQuantity(preset) {
  const qtyInput = document.getElementById("trading-modal-qty");
  const comp = gameState.companies.find(c => c.id === modalSelectedCompanyId);
  if (!comp) return;

  const price = gameState.prices[modalSelectedCompanyId] || comp.base_price;
  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const currentCash = meState ? meState.cash : 0;
  const port = gameState.portfolios[modalSelectedCompanyId] || { owned: 0, mortgaged: 0 };

  if (preset === 'MAX_BUY') {
    if (price > 0) {
      qtyInput.value = Math.max(1000, Math.floor(currentCash / price));
    }
  } else if (preset === 'MAX_SELL') {
    qtyInput.value = Math.max(1000, port.owned);
  } else {
    qtyInput.value = parseInt(preset) || 10000;
  }
  updateTradingModalEstimation();
}

function updateTradingModalEstimation() {
  const qtyInput = document.getElementById("trading-modal-qty");
  let qty = parseInt(qtyInput.value) || 0;
  if (qty < 0) qty = 0;

  const comp = gameState.companies.find(c => c.id === modalSelectedCompanyId);
  if (!comp) return;

  const price = gameState.prices[modalSelectedCompanyId] || comp.base_price;
  const total = price * qty;

  const estValEl = document.getElementById("trading-modal-est-value");
  const estStatusEl = document.getElementById("trading-modal-est-status");

  estValEl.textContent = `Rs. ${total.toLocaleString()}`;

  const meState = gameState.players.find(p => p.player_id === gameState.me.id);
  const currentCash = meState ? meState.cash : 0;
  const port = gameState.portfolios[modalSelectedCompanyId] || { owned: 0, mortgaged: 0 };

  // Generate helper messages
  let statusMsg = "";
  if (currentCash < total) {
    statusMsg = `<span class="text-rose-500 font-bold">⚠️ Insufficient Cash to Buy/Cover (Need Rs. ${(total - currentCash).toLocaleString()} more)</span>`;
  } else {
    statusMsg = `<span class="text-emerald-600 font-medium">✓ Affordability Checked</span>`;
  }
  
  if (port.owned < qty) {
    statusMsg += `<br><span class="text-amber-500 font-medium">Note: Selling exceeds owned positions (requires Short Sell if enabled)</span>`;
  }

  estStatusEl.innerHTML = statusMsg;
}

async function handleModalTrade(type) {
  const qtyInput = document.getElementById("trading-modal-qty");
  let qty = parseInt(qtyInput.value) || 0;
  if (isNaN(qty) || qty <= 0) {
    triggerToast("Invalid Quantity", "Please enter a valid positive quantity.", true);
    return;
  }

  if (!modalSelectedCompanyId) return;

  await executeTrade(modalSelectedCompanyId, qty, type);
  closeTradingModal();
}

function renderPortfolioSummary(totalVal) {
  const parent = document.getElementById("owned-portfolio-list");
  if (!parent) return;
  parent.innerHTML = "";

  let count = 0;
  gameState.companies.forEach(c => {
    const port = gameState.portfolios[c.id] || { owned: 0, mortgaged: 0 };

    if (port.owned !== 0 || port.mortgaged > 0) {
      count++;
      const price = gameState.prices[c.id] || c.base_price;
      const isShort = port.owned < 0;

      // Add direct Mortgage 10k button if qualifying
      let mortgageLink = "";
      if (gameState.room.loan_mortgage_enabled && port.owned >= 10000) {
        mortgageLink = `
          <button onclick="handleMortgageAssets('${c.id}')" class="text-amber-600 hover:text-amber-700 font-bold hover:underline transition-all bg-amber-50 hover:bg-amber-100/80 px-1.5 py-0.5 rounded text-[8px] border border-amber-200/50 mt-1 block w-max">
            <i class="fa-solid fa-building-columns mr-0.5"></i> Mortgage 10k
          </button>
        `;
      }

      const row = document.createElement("div");
      row.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100";
      row.innerHTML = `
        <div>
          <span class="font-bold text-slate-800">${c.symbol}</span>
          <span class="text-[9px] text-slate-400 block">
            ${isShort ? `<span class="text-rose-600 font-bold">SHORT:</span> ${Math.abs(port.owned).toLocaleString()}` : `${port.owned.toLocaleString()} owned`} 
            ${port.mortgaged > 0 ? `· <span class="text-amber-600 font-bold">${port.mortgaged.toLocaleString()} mortgaged</span>` : ''}
          </span>
          ${mortgageLink}
        </div>
        <strong class="${isShort ? 'text-rose-600' : 'text-slate-800'}">Rs. ${(port.owned * price).toLocaleString()}</strong>
      `;
      parent.appendChild(row);
    }
  });

  if (count === 0) {
    parent.innerHTML = '<p class="text-slate-400 text-center py-4">No active stock positions in portfolio.</p>';
  }
}