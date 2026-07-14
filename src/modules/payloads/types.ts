// Bundled-at-build-time payload library schema. JSON files under ./data/
// conform to PayloadCategoryFile; the schema is locked because rotating
// fields after entries land would require rewriting every JSON file.

export interface PayloadEntry {
  id: string;
  label: string;
  payload: string;
  notes: string;
  tags: string[];
}

export interface PayloadCategoryFile {
  id: string;
  label: string;
  entries: PayloadEntry[];
}
