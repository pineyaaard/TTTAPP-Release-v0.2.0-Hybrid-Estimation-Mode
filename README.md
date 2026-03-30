# AI-Powered Auto Body Repair Estimator

This project features an advanced AI-driven estimation system for auto body repairs. It utilizes the Gemini API to analyze images of vehicle damage and generate detailed, professional repair estimates.

## Key Features

### 1. Intelligent Damage Analysis
- **Visual Inspection:** The system processes uploaded images of damaged vehicles to identify the scope of required repairs.
- **Repair Categorization:** Automatically categorizes necessary actions into specific repair types:
  - `repair_and_paint`: Standard repair and painting.
  - `replace_and_paint`: Part replacement followed by painting.
  - `replace_only`: Replacement of unpainted parts (e.g., plastics, glass).
  - `paint_only`: Painting without structural repair.
  - `pdr` (Paintless Dent Repair): Specialized dent removal without painting.
  - `polishing_only`: Surface polishing for minor scratches.

### 2. Class-Based Labor Multipliers
To accurately reflect market realities and the complexity of working on different vehicles, the system implements a dynamic labor cost multiplier based on the vehicle's brand:

- **Standard (Multiplier 1.0):** Skoda, VW, Hyundai, Kia, Toyota, Ford.
  - *Reasoning:* Straightforward assembly/disassembly, standard clips, common colors, lower risk.
- **Business / Premium (Multiplier 1.3 - 1.5):** BMW, Mercedes, Audi, Lexus, Volvo.
  - *Reasoning:* Complex electronics (sensors, radars, cameras), aluminum components, specialized fasteners, higher risk of damaging expensive parts during disassembly.
- **Luxury / Sport (Multiplier 2.0+):** Porsche, Bentley, Maserati, Land Rover.
  - *Reasoning:* Extremely expensive components, complex engineering, high liability, specialized tools required.
- **Commercial / Large SUVs (Multiplier 1.3+):** Ford Transit, VW Crafter, Toyota Land Cruiser, Cadillac Escalade.
  - *Reasoning:* Large surface areas requiring more materials and time, physical difficulty in handling oversized parts.

### 3. Normohodiny (Nh) Calculation
All labor is calculated using standard labor hours (Normohodiny - Nh) rather than fixed prices per element. The cost per Nh is dynamically adjusted based on the vehicle class multiplier.

### 4. Advanced Repair Logic
The AI is instructed with specific rules for complex scenarios:
- **PDR (Paintless Dent Repair):** Evaluates if PDR is viable (no paint damage, accessible area). If PDR is chosen, painting is explicitly excluded.
- **Plastic Welding:** Considers plastic repair for minor bumper damage instead of full replacement.
- **Hidden Damage:** Anticipates potential internal damage (e.g., behind a crushed bumper) and flags it for physical inspection.
- **Aluminum Parts:** Applies a 2x multiplier for repairs on aluminum components due to the specialized skills and equipment required.

### 5. Transparent Auditing
The system generates an `audit_layer` in its output, providing the reasoning behind the chosen vehicle class multiplier and the calculated cost per labor hour, ensuring transparency in the estimation process.

## Note on Parts
This summary focuses exclusively on the logic for estimating labor, painting, and bodywork. The system also includes functionality for identifying and pricing replacement parts, which is handled via a separate integration.
