
🚀 Release v0.2.0 - Unified Logic & Hybrid Estimation Mode
Status: Alpha (Hybrid AI + Manual Routing)

Accuracy Benchmark: ~70% baseline hit rate (n=100 validation test cases).

This release introduces major architectural updates to the TTTAP Core engine, merging disparate prompt logics into a cohesive decision tree and introducing human-in-the-loop (HITL) capabilities to mitigate Vision LLM limitations.

🆕 Key Architectural Updates:
Unified Routing Engine (Monolithic System Prompt):
Consolidated the previously separated PDR and Paint/Bodywork logic trees into a single, comprehensive System Instruction. This restructuring optimizes context window utilization and forces the AI to evaluate all repair parameters simultaneously, significantly reducing hallucination rates across edge cases.

Hybrid Manual Override (HMO Module):
Implemented a manual input layer allowing users to explicitly flag specific panels for refinishing (Paint) or Remove & Install (R&I). This solves the "refresh" problem where microscopic wear, clear coat degradation, or customer-requested repaints cannot be reliably detected by the Vision API. The AI now dynamically recalculates the final estimate by merging its visual findings with user-defined manual overrides.

Performance Validation:
Initial stress-testing (100 distinct real-world damage cases) yielded a ~70% automated accuracy rate. The estimates successfully aligned with strict auto body shop unit economics (labor hours and pricing) without requiring human correction in the majority of standard collision scenarios.
