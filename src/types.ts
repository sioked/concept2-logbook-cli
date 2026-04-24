export interface TokenConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp ms
}

export interface C2Result {
  id: number;
  user_id: number;
  date: string; // "YYYY-MM-DD"
  datetime: string; // ISO 8601
  timezone: string;
  date_utc: string;
  distance: number; // meters
  type: "rower" | "skierg" | "bikeerg";
  time: number; // tenths of seconds
  time_formatted: string; // "m:ss.t"
  pace: number; // tenths of seconds per 500m
  pace_formatted: string; // "m:ss.t /500m"
  weight_class: "H" | "L";
  verified: boolean;
  ranked: boolean;
  comments: string;
  privacy: "private" | "public";
  stroke_rate: number | null;
  workout: {
    type: string;
    description: string;
    intervals?: C2Interval[];
  };
}

export interface C2Interval {
  type: string;
  distance: number;
  time: number;
  time_formatted: string;
  pace: number;
  pace_formatted: string;
  rest_time: number;
  rest_distance: number;
  stroke_rate: number | null;
  calories: number;
}

export interface C2ResultsResponse {
  data: C2Result[];
  meta: {
    pagination: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
      links: {
        next?: string;
        prev?: string;
      };
    };
  };
}
