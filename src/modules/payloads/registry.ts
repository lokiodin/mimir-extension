import type { PayloadCategoryFile } from "./types";
import xssData from "./data/xss.json";
import sqliData from "./data/sqli.json";
import cmdiData from "./data/cmdi.json";

export const CATEGORIES: ReadonlyArray<PayloadCategoryFile> = [
  xssData as PayloadCategoryFile,
  sqliData as PayloadCategoryFile,
  cmdiData as PayloadCategoryFile,
];
