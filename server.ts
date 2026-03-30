import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import os from "os";
import { Telegraf, Context } from "telegraf";
import axios from "axios";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";

let db: any = null;
try {
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Firebase initialization failed in backend. Telegram bot CRM features may not work.");
}

// --- Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

const vinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 VIN lookups per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many VIN lookups, please try again later." }
});

// --- Gemini Setup ---
// API Key is loaded dynamically per request to support AI Studio environment


const SYSTEM_INSTRUCTION = `
You are the Lead Auto Body Estimator at "SWAGARAGE" (Prague). 
Your fundamental directive is to calculate accurate estimates based purely on Czech market realities, adhering strictly to established flat-rate labor hours.
Calculate ONLY in LABOR HOURS (Normohodiny / Nh). 1 Nh = 1000 Kč. NEVER invent random currency values.

--- 1. CAR IDENTIFICATION & CLASS ---
Step 1: Identify the vehicle brand and model.
Step 2: Set the Class Multiplier (Default to Standard 1.0x if unsure).


--- 2. STRICT ESTIMATION RULES & HOURS (CRITICAL MARKET LOGIC) ---
You MUST follow these overriding rules based on the visual evidence. Evaluate each panel separately:

* RULE 1: PAINTING HOURS (Окрас - FIXED BASE)
- Fender / Wing (Крыло): 4.5 Nh
- Door (Дверь): 5.0 - 6.0 Nh (Depending on size)
- Bumper (Бампер): 5.0 Nh
- Hood (Капот): Base * 1.5 = 7.5 Nh
- Roof (Крыша): Base * 2.0 = 10.0 Nh
- Grille / Insert (Решетка): 6.0 Nh (If painted)
- Transition Paint (Переход): 2.5 Nh

* RULE 2: REPAIR HOURS (Ремонт - CAP LIMITS)
- PDR (Paintless Dent Repair): If paint is NOT torn, prioritize PDR! Dent repair 4.5 Nh + 2.0 Nh access = 6.5 Nh.
- Plastic Bumper Solder (Пайка): Minor/Medium cracks. Max 1.5 - 2.5 Nh. (Total with paint should be around 6.5 - 7.5 Nh).
- Light Scuff/Scratch: 1.0 - 2.0 Nh.
- Medium Dent: 2.5 - 4.0 Nh.
- Heavy Dent (Torn metal): 4.5 - 6.0 Nh max.

* RULE 3: SEVERE DAMAGE = REPLACEMENT ONLY (Замена)
If a panel (doors, fenders) is heavily crushed, folded, or structurally compromised (e.g., severe side impacts like the white VW):
- FORBIDDEN: Do not calculate Heavy Repair hours (No 8.0h repair).
- ACTION: Calculate ONLY Installation/Removal (С/У) 1.5 Nh + Painting (Rule 1). 
- HEURISTIC FOR SEVERE SIDE CRASHES: Replacing 2 doors, a fender, painting, plus heavy rocker panel (порог) and door jambs (проемы) repair should aggregate to roughly 55.0 - 65.0 Nh (55,000 - 65,000 Kč).

* RULE 4: STRUCTURAL / FRAME WORK IS GREY (Стапель)
If the B-pillar, chassis legs, or roof rails are severely damaged:
- FORBIDDEN: Do not add hours for frame alignment in the math. Cost MUST be 0 Nh.
- TRIGGER: Add to grey_flags: "Требуется проверка геометрии кузова (стапель). Стоимость стапельных работ определится только после живого осмотра."

* RULE 5: ADJACENT PANEL DISMISSAL (Соседние элементы - CRITICAL)
If a heavily damaged panel borders another panel that has only tiny, superficial scratches or gap issues:
- FORBIDDEN: DO NOT charge repair or paint for this adjacent panel. Cost = 0 Nh.
- TRIGGER: Add to grey_flags: "На соседнем элементе (указать деталь) есть незначительные повреждения или сбит зазор. Возможно уйдет полировкой/регулировкой. В счет не добавлено."

* RULE 6: RUST & CORROSION REMEDIATION (Сварка / Рыжики)
If rust is visible:
- Wheel Arch (Арка): Excision/Welding = 7.0 Nh + Painting = 5.0 Nh. (Total 12.0 Nh / 12,000 Kč per arch).
- Door Bottom (Низ двери): Welding/Patch = 5.0 Nh + Painting = 5.0 Nh. (Total 10.0 Nh / 10,000 Kč per door).
- Sill (Порог): Welding = 5.0-8.0 Nh + Painting = 3.0-5.0 Nh.

* RULE 7: INTERNAL ELEMENTS (Внутренние элементы)
If the damage involves internal elements (e.g., door jambs/проемы, pillars/стойки, inner arches, radiator support/телевизор):
- ACTION: Calculate the estimated cost, but MUST set "type" to "internal_element". These will be excluded by default in the UI.

* RULE 8: HEADLIGHT REMOVAL (С/У Фары)
If the front bumper requires removal/replacement (С/У), the removal and installation of the headlights (С/У фары) is INCLUDED in the bumper work. Do NOT add separate labor hours for headlight R&I. Cost = 0 Nh.

* RULE 9: HOOD TRANSITION (Капот - Переход)
For light edge damage on the hood, calculate Light Repair (1.0 - 2.0 Nh) + Transition Paint (Переход 2.5 Nh). Do not charge full hood paint (7.5 Nh) unless the damage is extensive.

* RULE 10: HIDDEN/SUSPECTED DAMAGE (Скрытые/Подозрительные элементы)
If you suspect damage to elements not clearly visible (e.g., washer fluid reservoir, brackets, hidden plastics, suspension parts), calculate their cost but MUST set "type" to "internal_element" so they are excluded by default.

* RULE 11: FRONTAL CRASH SYMMETRY (Симметрия при лобовом ДТП)
If the vehicle has suffered a heavy direct frontal impact, but the photo only shows one side clearly (e.g., one smashed fender), you MUST assume the opposite fender is also damaged. Add the opposite fender to the estimate.

* RULE 12: STRICT VISIBILITY (Только видимые повреждения)
- FORBIDDEN: Do NOT hallucinate damage. If a panel (e.g., rocker panel/порог, rear fender/заднее крыло) is NOT clearly visible or NOT clearly damaged in the photos, DO NOT include it as a standard repair.
- ACTION: If you strongly suspect hidden damage (e.g., wheel arch liners/подкрылки, internal brackets, hidden sensors), you MUST classify it as "internal_element" so it is excluded from the total cost by default.

- "pdr_verdict": (true/false) If "has_torn_paint_or_crash" is false -> true (PDR ONLY mode). Else false.

* ZERO-DAMAGE CATCH: If "pdr_verdict" is false AND "has_torn_paint_or_crash" is false, output strictly: "0 Kč. Ошибка: Повреждения не обнаружены. Попробуйте загрузить фото второй раз либо под другим углом." and STOP.

--- 3. PDR MATRIX (USE ONLY IF pdr_verdict = true) ---
* ACCESS RULE EXCEPTION (DOOR R&I): 
  - If is_door=true AND the dent is evaluated as STAGE 3, STAGE 4, STAGE 5, or STAGE 6: You MUST add exactly 2.0h for door disassembly.
  - If is_door=true AND the dent is evaluated as STAGE 1 or STAGE 2: Add exactly 0h for disassembly (external glue pull / window access).
* STAGE RULE (Strictly 6 Stages):
  - STAGE 1-2 (1.0 - 3.0h): Small to medium shallow dents.
  - STAGE 3 (3.0 - 4.0h): Medium smooth dent (e.g., standard fender arch dent = 3.5h).
  - STAGE 4 (4.0 - 5.0h): Medium-large dent, slightly sharp, or a CLEAR CREASE (залом) on a flat panel. (Typical door crease is EXACTLY 4.5h).
  - STAGE 5 (5.0 - 6.0h): Sharp, folded dent on a BODY LINE / RIB (ребро жесткости). Typical door rib dent is EXACTLY 5.5h.
  - STAGE 6 (6.0 - 7.0h): Severe stretched metal.
* PDR ROUNDING RULE: Round final combined PDR cost (Base PDR + Access) to nearest 500 or 1000 Kč.
* FORBIDDEN IN PDR: No Painting.

--- OUTPUT FORMAT (STRICT JSON) ---
"confidence" MUST be a valid float.
In "description", explicitly show the math in Nh (e.g., "С/У (1.5ч) + Окрас (6.0ч) = 7.5ч * 1000 Kč").
Output "totalCost" as the sum of all components in Kč (1 Nh = 1000), EXCLUDING items with type "minor_adjacent", "frame_work", or "internal_element".
For each repair item, you MUST provide a "type" field: "standard", "minor_adjacent", "replacement", "frame_work", or "internal_element".

{
  "audit_layer": { "reasoning": "Severe side impact detected. Doors require replacement, adjacent scuffs ignored." },
  "carModel": "Volkswagen Jetta",
  "carClass": "standard",
  "confidence": 0.98, 
  "totalCost": 61500,
  "repairs": [
    { 
      "name": "Передняя левая дверь", 
      "description": "Замена: С/У (1.5ч) + Окрас (6.0ч) = 7.5ч.", 
      "cost": 7500,
      "type": "replacement"
    }
  ],
  "grey_flags": [
    "Требуется проверка геометрии кузова (стапель). Стоимость определится после осмотра.",
    "На соседнем переднем крыле есть царапины, в счет не добавлено."
  ],
  "summary": "Масштабные кузовные работы левой стороны, замена дверей, ремонт порога.",
  "notes": "Окончательная стоимость и скрытые дефекты (проемы) формируются после дефектовки."
}
`;

async function estimateDamage(files: { data: string, mimeType: string }[]) {
  const model = "gemini-3-flash-preview"; 
  
  const uploadedFiles: string[] = [];
  const parts: any[] = [];

  try {
    for (const file of files) {
      const isVideo = file.mimeType.startsWith("video/");
      const isLarge = file.data.length > 5 * 1024 * 1024; // ~5MB base64

      if (isVideo || isLarge) {
        // Use File API for videos or large images
        const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        fs.writeFileSync(tempFilePath, Buffer.from(file.data, 'base64'));
        
        try {
          const currentApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
          const localAi = new GoogleGenAI({ apiKey: currentApiKey });
          const uploadResponse = await localAi.files.upload({
            file: tempFilePath,
            config: {
              mimeType: file.mimeType,
            }
          });
          
          // Poll until the file is ACTIVE (especially for videos)
          let fileState = uploadResponse.state;
          let attempts = 0;
          while (fileState === "PROCESSING" && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
              const fileInfo = await localAi.files.get({ name: uploadResponse.name });
              fileState = fileInfo.state;
            } catch (e) {
              console.error("Error polling file status:", e);
              break;
            }
            attempts++;
          }
          
          if (fileState === "FAILED") {
             throw new Error(`File processing failed for ${uploadResponse.name}`);
          }
          
          uploadedFiles.push(uploadResponse.name);
          parts.push({
            fileData: {
              fileUri: uploadResponse.uri,
              mimeType: file.mimeType
            }
          });
        } finally {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        }
      } else {
        // Use inlineData for small images
        parts.push({
          inlineData: {
            data: file.data,
            mimeType: file.mimeType
          }
        });
      }
    }

    const currentApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    const localAi = new GoogleGenAI({ apiKey: currentApiKey });

    const response = await localAi.models.generateContent({
      model: model,
      contents: [{ parts: [...parts, { text: "Analyze damage strictly by rules. Show math in Nh. Severe side impacts should hit ~60k. Discard minor adjacent damage." }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = response.text || "{}";
    // Clean up potential markdown blocks if the model includes them despite responseMimeType
    let jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    jsonStr = jsonStr.replace(/:\s*NaN/g, ': 0.90');

    let result: any;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON Parse Error. Raw text:", text);
      // Fallback object to prevent crash
      result = { 
        confidence: 0.5, 
        totalCost: 0, 
        repairs: [], 
        summary: "Ошибка обработки данных от AI. Попробуйте еще раз.",
        carModel: "Не определено"
      };
    }
    
    if (result.confidence === null || isNaN(result.confidence)) {
      result.confidence = 0.90;
    }

    if (!result.repairs || !Array.isArray(result.repairs)) {
      result.repairs = [];
    }

    return result;
  } finally {
    // Cleanup uploaded files
    const currentApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    const localAi = new GoogleGenAI({ apiKey: currentApiKey });
    for (const fileName of uploadedFiles) {
      try {
        await localAi.files.delete({ name: fileName });
      } catch (e) {
        console.error(`Failed to delete file ${fileName}:`, e);
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));
  
  // Handle JSON parsing errors and payload too large
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: "Payload too large. Please upload smaller files." });
    }
    next(err);
  });
  
  // Apply rate limiters to API routes
  app.use("/api/", apiLimiter);
  app.use("/api/vin", vinLimiter);

  // --- API Endpoints ---
  
  // VIN Decoder (Plan A / Plan B fallback)
  app.get("/api/vin/:vin", async (req, res) => {
    const { vin } = req.params;
    if (vin.length !== 17) {
      return res.status(400).json({ error: "Invalid VIN length. Must be 17 characters." });
    }
    
    try {
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
      if (!response.ok) throw new Error("Failed to fetch from NHTSA");
      const data = await response.json();
      
      if (data.Results && data.Results.length > 0) {
        const result = data.Results[0];
        if (result.Make && result.Model) {
          return res.json({
            vin: vin.toUpperCase(),
            make: result.Make,
            model: result.Model,
            year: result.ModelYear,
            engine: result.DisplacementL ? `${result.DisplacementL}L` : "Unknown",
            found: true
          });
        }
      }
      
      // Fallback if NHTSA doesn't find it
      res.json({
        vin: vin.toUpperCase(),
        make: "Unknown Make",
        model: "Unknown Model",
        year: "Unknown Year",
        engine: "Unknown",
        found: false
      });
    } catch (e) {
      console.error("VIN decode error:", e);
      res.status(500).json({ error: "Failed to decode VIN" });
    }
  });

  // Real Parts Search via Gemini
  app.post("/api/parts/search", async (req, res) => {
    const { vin, partName, make, model, year } = req.body;
    
    if (!partName) {
      return res.status(400).json({ error: "partName is required." });
    }

    try {
      const vehicleInfo = [make, model, year, vin ? `VIN: ${vin}` : ''].filter(Boolean).join(' ');
      
      const prompt = `Find the auto part "${partName}" for vehicle: ${vehicleInfo}.
      You MUST use Google Search to find the real OEM part number and real prices in the Czech Republic.
      
      1. Identify the correct OEM part number for this specific vehicle.
      2. Find the Retail price (for the client) - this should be the price on LKQ (lkq.cz / autokelly.cz) without registration.
      3. Find the Wholesale price (for the master) - this should be the price on Automedik (automedik.cz).
      4. If you cannot find exact prices, use your internal catalog knowledge to estimate realistic CZK prices for this specific premium/standard vehicle.
      5. Provide realistic search links based on the actual OEM part number you found:
         - LKQ: https://www.lkq.cz/Search?q=[PART_NUMBER]
         - Automedik: https://automedik.cz/autodily/hledani?search=[PART_NUMBER]
         - RRR.lt: https://rrr.lt/en/search?q=[PART_NUMBER]

      Return a JSON object with a "results" array containing these categories if applicable:
      "new_original", "good_aftermarket", "average_aftermarket", "cheap_aftermarket", "used_original".

      Format:
      {
        "partName": "The requested part name",
        "results": [
          {
            "category": "new_original",
            "name": "Brand - Part Name",
            "partNumber": "OEM12345",
            "retailPrice": 15000,
            "wholesalePrice": 12000,
            "link": "https://www.lkq.cz/Search?q=OEM12345"
          }
        ]
      }`;

      const currentApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
      const localAi = new GoogleGenAI({ apiKey: currentApiKey });

      const response = await localAi.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const text = response.text || "{}";
      const data = JSON.parse(text);

      res.json({
        partName,
        vin,
        results: data.results || []
      });
    } catch (e) {
      console.error("Parts search error:", e);
      // Fallback to a generic search link if API fails
      res.json({
        partName,
        vin,
        results: [
          {
            category: "new_original",
            name: `Оригинал - ${partName}`,
            partNumber: "Поиск...",
            retailPrice: 5000,
            wholesalePrice: 4000,
            link: `https://www.lkq.cz/Search?q=${encodeURIComponent(partName)}`
          }
        ]
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(3000, "0.0.0.0", () => console.log("Server on port 3000"));
}

startServer();
