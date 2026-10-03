// Loads the bundled JSON once and validates it (Claude.md §9.4).
// On failure, `dataResult` carries the error list that DataErrorPanel shows instead of the app.

import settings from "../data/settings.json";
import companies from "../data/companies.json";
import invoices from "../data/invoices.json";
import constraints from "../data/constraints.json";
import events from "../data/events.json";
import { validateDataset } from "./schema";
import type { DataResult } from "./types";

export const dataResult: DataResult = validateDataset({ settings, companies, invoices, constraints, events });
