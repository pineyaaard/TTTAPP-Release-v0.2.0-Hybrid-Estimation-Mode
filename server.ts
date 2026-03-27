import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Context } from "telegraf";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";

// --- Gemini Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
  const model = "gemini-3.1-pro-preview"; 
  
  const parts = files.map((file) => ({
    inlineData: {
      data: file.data,
      mimeType: file.mimeType
    }
  }));

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [...parts, { text: "Analyze damage strictly by rules. Show math in Nh. Severe side impacts should hit ~60k. Discard minor adjacent damage." }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const text = response.text || "{}";
  let jsonStr = text.replace(/${"```"}json\n?|\n?${"```"}/g, "").trim();
  jsonStr = jsonStr.replace(/:\s*NaN/g, ': 0.90');

  let result: any;
  try {
    result = JSON.parse(jsonStr);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    result = { confidence: 0.9, totalCost: 0, repairs: [] };
  }
  
  if (result.confidence === null || isNaN(result.confidence)) {
    result.confidence = 0.90;
  }

  if (!result.repairs || !Array.isArray(result.repairs)) {
    result.repairs = [];
  }

  return result;
}

// --- Telegram Bot Setup ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const bot = new Telegraf(BOT_TOKEN);
const mediaGroups = new Map<string, { files: { data: string, mimeType: string }[], timer: NodeJS.Timeout }>();

async function processMedia(ctx: Context, files: { data: string, mimeType: string }[]) {
  try {
    await ctx.reply("Анализирую повреждения по нормо-часам SWAGARAGE, пожалуйста, подождите...");
    const result = await estimateDamage(files);
    
    const confValue = parseInt((result.confidence * 100).toFixed(0));
    
    // --- РАСЧЕТ СКИДОК ---
    let rawTotal = result.totalCost || 0;
    let finalCost = rawTotal;
    let discountNote = "";
    
    if (rawTotal > 68000) {
        finalCost = Math.round(rawTotal * 0.92); 
        discountNote = `\n🎁 *Скидка 8%* (сумма более 68 000 Kč)`;
    } else if (rawTotal > 45000) {
        finalCost = Math.round(rawTotal * 0.95); 
        discountNote = `\n🎁 *Скидка 5%* (сумма более 45 000 Kč)`;
    }
    
    let message = `🔴 *SWAGARAGE | ESTIMATOR*\n\n`;
    message += `🚗 *Автомобиль:* ${result.carModel}\n`;
    message += `📊 *Класс:* ${result.carClass}\n`;
    message += `✅ *Уверенность AI:* ${confValue}%\n\n`;
    message += `🛠 *Детализация (1 Nh = 1000 Kč):*\n`;
    
    if (result.repairs && Array.isArray(result.repairs)) {
      result.repairs.forEach((r: any) => {
        const isExcluded = r.type === 'minor_adjacent' || r.type === 'frame_work' || r.type === 'internal_element';
        const costDisplay = isExcluded ? `[Исключено из сметы: ${r.cost.toLocaleString()} Kč]` : `${r.cost.toLocaleString()} Kč`;
        message += `• *${r.name}:* ${costDisplay}\n  _${r.description}_\n`;
      });
    }
    
    message += `\n---`;
    message += `\n💰 *Сумма работ:* ${rawTotal.toLocaleString()} Kč`;
    
    if (discountNote) {
        message += `${discountNote}\n`;
        message += `💳 *Итого к оплате:* ${finalCost.toLocaleString()} Kč\n\n`;
    } else {
        message += `\n\n`;
    }
    
    if (result.audit_layer && result.audit_layer.reasoning) {
        message += `🧠 *Логика:* _${result.audit_layer.reasoning}_\n\n`;
    }
    
    if (result.grey_flags && result.grey_flags.length > 0) {
        message += `⚠️ *Внимание:*\n`;
        result.grey_flags.forEach((flag: string) => {
             message += `- ${flag}\n`;
        });
        message += `\n`;
    }
    
    message += `📝 *Заключение:* ${result.summary}\n`;
    message += `_Примечание: ${result.notes || "Оценка предварительная. Детали оплачиваются отдельно."}_`;
    
    await ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(error);
    await ctx.reply("Ошибка анализа. Пожалуйста, попробуйте еще раз.");
  }
}

bot.on(["photo", "video"], async (ctx) => {
  const message = ctx.message as any;
  const mediaGroupId = message.media_group_id;
  let fileId = message.photo ? message.photo[message.photo.length - 1].file_id : message.video.file_id;
  let mimeType = message.photo ? "image/jpeg" : (message.video.mime_type || "video/mp4");

  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
  const base64 = Buffer.from(response.data, 'binary').toString('base64');
  const file = { data: base64, mimeType };

  if (mediaGroupId) {
    if (!mediaGroups.has(mediaGroupId)) mediaGroups.set(mediaGroupId, { files: [], timer: setTimeout(() => {}, 0) });
    const group = mediaGroups.get(mediaGroupId)!;
    group.files.push(file);
    clearTimeout(group.timer);
    group.timer = setTimeout(async () => {
      await processMedia(ctx, group.files);
      mediaGroups.delete(mediaGroupId);
    }, 1500);
  } else {
    await processMedia(ctx, [file]);
  }
});

async function startServer() {
  const app = express();
  if (BOT_TOKEN) bot.launch().then(() => console.log("Bot started"));

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
