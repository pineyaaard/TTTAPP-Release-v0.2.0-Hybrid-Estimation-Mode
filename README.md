# 🚀 TTTAP Core Engine (CAR DAMAGES AI ESTIMATOR) - Demo Release v3.0

**🎬 Watch Demo Video:** 



https://github.com/user-attachments/assets/ebbc4f2f-acb5-43fc-bf99-8cdb5cbd50c9



# TTTAP Core v3.0 (Alpha MVP) 🚗💡

**Hybrid AI Engine for Automated Auto Body Repair Estimation & Parts Sourcing**

TTTAP Core is a professional-grade hybrid engine that transforms visual data (photos) and text inputs into detailed, market-realistic auto repair estimates. Based on real-world European flat-rate labor hours (Normohodiny / Nh), this engine is designed to transition from a simple diagnostic calculator to a robust, deployable SaaS platform for modern auto repair shops.

---

## 🚀 Overview & Architecture Pivot (Upd 20.04)

**The Shift to API-First Stability:**
Early iterations of this engine relied on custom Python HTML scrapers (BeautifulSoup/Playwright) to navigate legacy European auto parts catalogs. However, visually scraping heavily nested, dynamic legacy tables with AI Vision proved computationally expensive, slow, and highly prone to layout-change breakages.

To achieve production-level stability and a strict target efficiency of under €0.10 per standard request, TTTAP Core v3.0 introduces a major architectural pivot:
1. **Deprecation of legacy HTML scrapers.**
2. **Integration of Commercial-Grade Auto Parts REST APIs** for 100% accurate VIN-to-OEM matching. Request times dropped from ~15s to ~2s.
3. **Headless Pricing Microservice:** A dedicated Playwright scraper that authenticates into **LOCAL wholesale suppliers** using B2B credentials to retrieve real-time trade margins. Used/aftermarket parts are dynamically cross-referenced via **LOCAL salvage marketplaces**.

---

## 🔥 Key Features

### 1. Advanced AI Heuristics (Gemini Flash & Pro)
- **Repair-First Policy:** The AI prioritizes metalwork and soldering (PDR/Plastic welding) over costly replacements unless structural compromise is detected.
- **Floor Price Heuristics:** Implements strict price floors for severe damage (e.g., heavy side impacts) to ensure estimates remain market-realistic and never underestimate catastrophic damage.
- **Anti-Hallucination:** Specially tuned prompts for compact city cars to prevent over-quoting unnecessary parts.

### 2. Dynamic Tone Matching & NLP Router
- The AI analyzes the user's input style (formal, slang, short, detailed) and automatically mirrors the communication tone. It correctly translates localized garage slang (e.g., "water pump", "bushings") into strict catalog categories while maintaining professional workshop standards.

### 3. Fully Automated Sourcing & Quoting
- **VIN Decoding:** Robust processing to identify exact make, model, year, and engine codes.
- **Real-Time B2B Scraping:** Fetches exact retail (B2C) and wholesale (B2B) pricing from **LOCAL suppliers**.
- **Used Parts Fallback:** Automatically searches **LOCAL salvage platforms** if new OEM parts are discontinued or prohibitively expensive, wrapping the process in strict timeouts to ensure speed.

### 4. Dual-Role Interface
- **Client View:** A clean, retail-focused summary presenting the final repair costs and labor hours.
- **Master View (Garage Mode):** Unlocks wholesale pricing, profit margin analysis, exact OEM part numbers, and direct supplier links for fast procurement.

---

## ⚙️ Tech Stack

- **Frontend:** React, Tailwind CSS, Vite
- **Backend:** Node.js (Express)
- **Database:** PostgreSQL (via Prisma) / Firebase Firestore (Lead Management)
- **AI Engine:** Google Gemini API (`@google/genai`)
  - *Gemini 3.0 Flash* (Vision + NLP Routing)
  - *Gemini 3.1 Pro* (Complex Deep Searches)
  - *Context Caching:* Used for caching massive 4,000+ token system instructions to drastically reduce recurring costs.
- **Microservices:** Playwright/Puppeteer (Headless B2B pricing scrapers), Commercial OEM Parts API.

---

## 🔄 Core Workflow

1. **Intake:** User uploads photos of vehicle damage and adds a natural language query with their VIN.
2. **Phase 1 (AI Router):** Gemini Flash interprets the slang, sets the tone, and identifies the exact vehicle assembly required.
3. **Phase 2 (Vision Audit):** Gemini Flash analyzes the damage, applies repair heuristics, and estimates labor hours (Nh).
4. **Phase 3 (OEM API):** Node.js backend queries the commercial Parts API using the VIN and Category ID to extract the exact Original Equipment Manufacturer (OEM) part numbers.
5. **Phase 4 (Pricing Engine):** The headless scraper hits **LOCAL wholesale databases** to fetch real-time parts pricing.
6. **Output:** A compiled, highly accurate estimate is delivered via Telegram or the web interface.

---

## ⚠️ Known Limitations (Alpha)
- **Dynamic Links Breakage:** Occasionally, aftermarket scrapers may timeout or fail if an OEM number is highly restricted or out of stock locally. The system defaults to general "Catalog Heuristics" in these edge cases.
- **Video Frame Processing:** 360-degree video audits are supported but currently trigger higher-cost Pro models. Manual frame extraction optimizations are in development to reduce processing costs.

---

**Status:** *Alpha MVP — Preparing for pilot deployment with partner garages.*
