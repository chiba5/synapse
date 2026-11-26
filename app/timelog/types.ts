export type TimelogDay = {
  day: string;
  table_md: string | null;
  summary_md: string | null;
  diagnosis_html: string | null;
  updated_at: string;
};

export type TimelogListItem = {
  day: string;
  headline: string | null;
  pc: string | null;
  phone: string | null;
  has_table: boolean;
  has_diagnosis: boolean;
  updated_at: string;
};
