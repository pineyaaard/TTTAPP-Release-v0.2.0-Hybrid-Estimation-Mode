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
Calculate ONLY in LABOR HOURS (1 Hour = 1000 Kč).

--- 1. CAR IDENTIFICATION & CLASS ---
Step 1: Identify market (Asian, Euro, US). 
Step 2: Set Class Multiplier. 
* CRITICAL MODEL DEFAULT: If you cannot identify the exact car model with 100% certainty, you MUST default to "Standard" (1.0x). DO NOT guess car classes.

--- 2. THE 9-LAYER AUDIT (BOOLEAN TRAP & ROUTER) ---
You MUST fill this before any cost calculation:
- "is_mud_or_water": (true/false) Are white streaks vertical or splattered?
- "is_reflection": (true/false) Are white lines following the body curves perfectly?
- "has_torn_paint_or_crash": (true/false) Paint is scratched to plastic/metal, gouges, rust, deformation.
- "is_parking_scuff": (true/false) Damage is superficial paint transfer, scuffing, or scratches (even if large area) on bumper corners, arches, or doors. Requires sanding/putty but NO plastic welding or heavy pulling.
- "has_misaligned_gaps": (true/false) Are the panel gaps uneven, or is the bumper/headlight popping out of its clips (зазоры гуляют)?
- "is_door": (true/false) Is the damaged part explicitly a car door?
- "is_bumper": (true/false) Is the damaged part explicitly a front or rear bumper?
- "is_hanging_part": (true/false) Combined flag. If is_door=true OR is_bumper=true -> true. Else false.
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

--- 4. PAINT & REPAIR MATRIX (USE ONLY IF has_torn_paint_or_crash = true) ---
* PARKING RULE OVERRIDE: If is_parking_scuff = true, you MUST use the following capped hours for Paint/Repair.
  - Painting (is_parking_scuff=true): Mandatory exactly 2.5h Transition Paint per panel.
  - Repair (is_parking_scuff=true): Mandatory exactly 2.5h Light repair (putty/prep) per panel.
  - R&I RULE (арматурка) for Parking Scuffs:
    * If has_misaligned_gaps = true AND is_hanging_part = true -> Use standard matrix R&I hours (1.0-1.5h).
    * If has_misaligned_gaps = false -> EXACTLY 0h (Even for bumpers/doors, prep and paint on the car).

Standard Matrix (Use ONLY IF is_parking_scuff = false):
PAINTING (Малярка):
- Transition Paint (Покраска переходом): 3.0h.
- Full Paint Standard (Bumper, Fender, Door): 5.0h.
- Full Paint Large (Hood, Roof): 8.0h.

REPAIR (Ремонт/Пайка пластика/Рихтовка):
- Light (scratches, minor plastic gouges): 1.5 - 2.5h.
- Medium (visible dents with torn paint, cracked bumpers): 3.5 - 4.5h.
- Heavy (severe panel deformation): 6.0 - 8.0h.

R&I (Арматурка / Снятие-Установка):
- Bumper/Door/Headlight: 1.0 - 1.5h.

--- 5. WARNINGS ---
* TOTAL REPAIR COST WARNING: If Total_Cost >= 5500, add note "ВНИМАНИЕ: Стоимость ремонта 5500+ крон. Возможно потребуется классический ремонт и окрас." (WARNING: Total repair cost is 5500+ CZK. Classic repair and paint may be needed.)

--- OUTPUT FORMAT (STRICT JSON) ---
"confidence" MUST be a valid float. Do NOT output "NaN".
In "description", strictly show your math (e.g., "Ремонт 3.5ч + Окрас 5.0ч" OR "ПДР Стейдж 3").

{
  "audit_layer": {
    "is_mud_or_water": false,
    "is_reflection": false,
    "has_torn_paint_or_crash": true,
    "pdr_verdict": false,
    "reasoning": "Вижу глубокую царапину и трещину на бампере. ЛКП повреждено, режим ПДР отключен. Считаем классический кузовной ремонт."
  },
  "carModel": "Skoda Octavia",
  "carClass": "standard",
  "confidence": 0.95, 
  "totalCost": 9500,
  "repairs": [
    { 
      "name": "Передний бампер", 
      "description": "Ремонт средний (3.5ч) + Окрас полный (5.0ч) + С/У (1.0ч) = 9.5ч * Коэфф Стандарт (1.0).", 
      "cost": 9500 
    }
  ],
  "summary": "Ремонт и покраска переднего бампера.",
  "notes": "Возможны скрытые повреждения."
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
    contents: [{ parts: [...parts, { text: "Analyze damage strictly by instructions. Confidence must be a valid float number." }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const text = response.text || "{}";
  // Очищаем от мусора Markdown
  let jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
  
  // ПРЕДОХРАНИТЕЛЬ ОТ NaN
  jsonStr = jsonStr.replace(/:\s*NaN/g, ': 0.90');

  const result = JSON.parse(jsonStr);
  
  // Двойная проверка на NaN
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
    await ctx.reply("Анализирую повреждения (Модель PRO), пожалуйста, подождите...");
    const result = await estimateDamage(files);
    
    const confValue = parseInt((result.confidence * 100).toFixed(0));
    
    let message = `🔴 *TTTAP | TWIN TRACK TORPEDO*\n`;
    message += `🔥 *TRACK 01: Покраска и кузовной цех*\n\n`;
    message += `🚗 *Автомобиль:* ${result.carModel}\n`;
    message += `📊 *Класс:* ${result.carClass}\n`;
    message += `✅ *Уверенность:* ${confValue}%\n\n`;
    message += `🛠 *Детализация работ:*\n`;
    
    if (result.repairs && Array.isArray(result.repairs)) {
      result.repairs.forEach((r: any) => {
        message += `• ${r.name}: ${r.cost.toLocaleString()} Kč\n  _${r.description}_\n`;
      });
    }
    
    message += `\n💰 *Итоговая стоимость:* ${result.totalCost.toLocaleString()} Kč\n\n`;
    
    if (result.audit_layer && result.audit_layer.reasoning) {
        message += `🧠 *Логика:* _${result.audit_layer.reasoning}_\n\n`;
    }
    
    message += `📝 *Заключение:* ${result.summary}\n`;
    message += `_Примечание: ${result.notes || "Оценка предварительная."}_`;
    
    await ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(error);
    await ctx.reply("Ошибка анализа. Попробуйте другое фото.");
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
    }, 1000);
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