import os
import asyncio
import json
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
from google import genai
from google.genai import types as genai_types
import base64

# --- Configuration ---
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Initialize Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)

# Initialize Telegram Bot
bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()

SYSTEM_INSTRUCTION = """
You are the Lead Auto Body Estimator at "SWAGARAGE" (Prague). 
Calculate ONLY in LABOR HOURS (1 Hour = 1000 Kč). 

--- 1. CAR IDENTIFICATION & CLASS ---
- Step 1: Identify market (Asian, Euro, US). 
  * ANTI-FABIA RULE: If you see a grey sedan front fender with sweeping headlights and 5-spoke wheels, it is an Asian car (Toyota/Honda). DO NOT EVER guess "Skoda Fabia".
- Step 2: Set Class Multiplier. 
  * CRITICAL RULE: If you cannot identify the exact car model with 100% certainty, you MUST default to "Standard" (1.0x). DO NOT guess "Economy" (0.8x) or "Comfort" (1.2x) without a clear visible logo.
  * Economy: 0.8x (Dacia, older models)
  * Standard: 1.0x (Default for unknown, Camry, Octavia, VW, Superb, Passat)
  * Comfort: 1.2x (BMW 5, Arteon, Mercedes E)
  * Premium: 1.5x+ (BMW 7, Mercedes S, Porsche)

--- 2. THE 5-LAYER AUDIT (BOOLEAN TRAP & SWITCH) ---
You MUST fill this before any cost calculation:
- "is_mud_or_water": (true/false) Are white streaks vertical or splattered? If yes -> true.
- "is_reflection": (true/false) Are white lines following the body curves perfectly? If yes -> true.
- "has_torn_paint_or_crash": (true/false) Is the paint actually scratched to the plastic/metal? Are there deep gouges, rust, or severe deformation? (If is_mud_or_water=true, this must be false).
- "pdr_verdict": (true/false) If "has_torn_paint_or_crash" is false -> true (PDR ONLY mode). If true -> false (PAINT & REPAIR mode).

--- 3. PDR MATRIX (USE ONLY IF pdr_verdict = true) ---
* CRITICAL STAGE RULE: A smooth, rounded dent on a wheel arch/fender is STAGE 3 or 4. DO NOT use Stage 5 for smooth arch dents. Stage 5 is STRICTLY for sharp, folded creases (like heavy door impacts).
- STAGE 1-2 (1.0 - 3.0h): Small to medium dents.
- STAGE 3 (3.0 - 4.0h): Medium smooth dent (e.g., standard fender arch dent = 3.5h).
- STAGE 4 (4.0 - 5.0h): Medium-large dent, slightly sharp.
- STAGE 5 (5.0 - 6.0h): Sharp, folded dent on a BODY LINE / RIB (ребро жесткости). Typical door rib dent is EXACTLY 5.5h.
- STAGE 6 (6.0 - 7.0h): Severe stretched metal.
* PDR ROUNDING RULE: Round final PDR cost to nearest 500 or 1000 Kč.
* FORBIDDEN IN PDR: No Painting, No R&I hours.

--- 4. PAINT & REPAIR MATRIX (USE ONLY IF has_torn_paint_or_crash = true) ---
If the car is in a crash or paint is torn, calculate using this formula: (REPAIR + PAINT + R&I).
PAINTING (Малярка):
- Transition Paint (Покраска переходом): 2.5 - 3.0h.
- Full Paint Standard (Bumper, Fender, Door): 5.0h.
- Full Paint Large (Hood, Roof): 8.0h.

REPAIR (Ремонт/Пайка пластика/Рихтовка):
- Light (scratches, minor plastic gouges): 1.5 - 2.5h.
- Medium (visible dents with torn paint, cracked bumpers): 3.5 - 4.5h.
- Heavy (severe panel deformation): 6.0 - 8.0h.
- Welding (Сварка порогов/арок): 5.0 - 10.0h.

R&I (Арматурка / Снятие-Установка):
- Bumper/Door/Headlight: 1.0 - 1.5h.
- Rear Fender/Roof: 0h (Welded parts).

STRUCTURAL (Стапель):
- Only for bent pillars or frame: 10.0 - 30.0h.

--- 5. WARNINGS ---
If PDR cost >= 5000: Add note "ВНИМАНИЕ: Стоимость ПДР 5000+ крон. Возможно потребуется классический ремонт и окрас."

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
"""

media_groups = {}

async def estimate_damage(files_data):
    model = "gemini-3.1-pro-preview"
    
    contents = []
    for file in files_data:
        contents.append(
            genai_types.Part.from_bytes(
                data=file["data"],
                mime_type=file["mimeType"]
            )
        )
    contents.append(genai_types.Part.from_text(text="Analyze damage strictly by instructions."))

    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        
        text = response.text or "{}"
        json_str = text.replace("```json", "").replace("```", "").strip()
        return json.loads(json_str)
    except Exception as e:
        print(f"Failed to parse AI response: {e}")
        raise Exception("Не удалось обработать ответ от ИИ. Попробуйте еще раз.")

async def process_media(message: Message, files_data):
    try:
        await message.answer("Анализирую повреждения (Модель PRO), пожалуйста, подождите...")
        result = await estimate_damage(files_data)
        
        msg = f"🔴 *TTTAP | TWIN TRACK TORPEDO*\n"
        msg += f"🔥 *TRACK 01: Покраска и кузовной цех*\n\n"
        msg += f"🚗 *Автомобиль:* {result.get('carModel', 'Неизвестно')}\n"
        msg += f"📊 *Класс:* {result.get('carClass', 'Неизвестно')}\n\n"
        msg += f"🛠 *Детализация работ:*\n"
        
        for r in result.get('repairs', []):
            msg += f"• {r.get('name')}: {r.get('cost', 0):,} Kč\n  _{r.get('description')}_\n"
            
        msg += f"\n💰 *Итоговая стоимость:* {result.get('totalCost', 0):,} Kč\n\n"
        
        audit = result.get('audit_layer', {})
        if audit.get('reasoning'):
            msg += f"🧠 *Логика:* _{audit.get('reasoning')}_\n\n"
            
        msg += f"📝 *Заключение:* {result.get('summary', '')}\n"
        notes = result.get('notes', 'Оценка предварительная.')
        msg += f"_Примечание: {notes}_"
        
        await message.answer(msg, parse_mode="Markdown")
    except Exception as e:
        print(e)
        await message.answer("Ошибка анализа. Попробуйте другое фото.")

@dp.message(lambda message: message.photo or message.video)
async def handle_media(message: Message):
    media_group_id = message.media_group_id
    
    if message.photo:
        file_id = message.photo[-1].file_id
        mime_type = "image/jpeg"
    else:
        file_id = message.video.file_id
        mime_type = message.video.mime_type or "video/mp4"

    file = await bot.get_file(file_id)
    file_path = file.file_path
    
    # Download file
    downloaded_file = await bot.download_file(file_path)
    file_bytes = downloaded_file.read()
    
    file_data = {"data": file_bytes, "mimeType": mime_type}

    if media_group_id:
        if media_group_id not in media_groups:
            media_groups[media_group_id] = {"files": [], "timer": None}
            
        group = media_groups[media_group_id]
        group["files"].append(file_data)
        
        if group["timer"]:
            group["timer"].cancel()
            
        async def process_group():
            await asyncio.sleep(1)
            files = media_groups.pop(media_group_id, {}).get("files", [])
            if files:
                await process_media(message, files)
                
        group["timer"] = asyncio.create_task(process_group())
    else:
        await process_media(message, [file_data])

async def main():
    if not TELEGRAM_BOT_TOKEN:
        print("TELEGRAM_BOT_TOKEN is not set!")
        return
    print("Bot started")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
