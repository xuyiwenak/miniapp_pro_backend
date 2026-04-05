import z from "zod";
import { schema as zoneConfigSchema } from "../../../json_schemas/zone_config";

export type TzoneConfigSchema = z.infer<typeof zoneConfigSchema>;
