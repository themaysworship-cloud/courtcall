export type Profile = {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  skill_level: string | null;
  bio: string | null;
  chat_alerts?: boolean;
};

export type Session = {
  id: string;
  play_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string | null;
  location: string;
  capacity: number;
  notes: string | null;
  created_by: string;
};

export type Signup = { session_id: string; user_id: string; created_at: string };

export type Message = {
  id: number;
  room: string;
  user_id: string;
  body: string;
  image_url?: string | null;
  created_at: string;
};

export type Reaction = { message_id: number; user_id: string; emoji: string };

export type DayRsvp = {
  play_date: string; // YYYY-MM-DD
  user_id: string;
  status: "in" | "out";
  updated_at: string;
};
