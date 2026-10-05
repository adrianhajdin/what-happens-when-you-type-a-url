import type { StageModule } from "@/core/types";
import { Stage0Url } from "./Stage0Url";
import { Stage1Dns } from "./Stage1Dns";
import { Stage2Tcp } from "./Stage2Tcp";
import { Stage3Tls } from "./Stage3Tls";
import { Stage4Edge } from "./Stage4Edge";
import { Stage5Ocean } from "./Stage5Ocean";
import { Stage6Render } from "./Stage6Render";

/** Order matters: index i ↔ STAGES[i] in src/lib/stages.ts. */
export const SCENES: (StageModule & { id: string })[] = [Stage0Url, Stage1Dns, Stage2Tcp, Stage3Tls, Stage4Edge, Stage5Ocean, Stage6Render];
