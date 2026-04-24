interface TokenConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}
interface C2Result {
    id: number;
    user_id: number;
    date: string;
    datetime: string;
    timezone: string;
    date_utc: string;
    distance: number;
    type: "rower" | "skierg" | "bikeerg";
    time: number;
    time_formatted: string;
    pace: number;
    pace_formatted: string;
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
interface C2Interval {
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
interface C2ResultsResponse {
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

declare function loadConfig(): TokenConfig | null;
declare function saveConfig(config: TokenConfig): void;
declare function isTokenExpired(config: TokenConfig): boolean;
declare function refreshAccessToken(config: TokenConfig): Promise<TokenConfig>;
declare function getValidToken(config: TokenConfig): Promise<string>;
declare function runAuthFlow(clientId: string, clientSecret: string, redirectUri: string): Promise<void>;

interface ResultsFilter {
    type?: "rower" | "skierg" | "bikeerg";
    from?: string;
    to?: string;
    limit?: number;
}
declare function fetchResults(token: string, filter?: ResultsFilter): Promise<C2Result[]>;

export { type C2Interval, type C2Result, type C2ResultsResponse, type ResultsFilter, type TokenConfig, fetchResults, getValidToken, isTokenExpired, loadConfig, refreshAccessToken, runAuthFlow, saveConfig };
