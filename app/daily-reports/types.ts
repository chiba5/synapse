export type Report = {
  id: string;
  report_date: string;
  body: string;
  created_at: string;
  is_read: boolean;
  author: { id: string; email: string; display_name: string | null };
};

export type Profile = { id: string; email: string; display_name: string | null };
