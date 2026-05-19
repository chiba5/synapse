export type Note = {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
  is_read: boolean;
  author: { id: string; email: string; display_name: string | null };
};

export type Profile = { id: string; email: string; display_name: string | null };
