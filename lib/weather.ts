export interface WeatherResult {
  tempF: number;
  condition: string;
}

const TIME_OF_DAY_HOURS: Record<string, number> = {
  Morning: 8,
  Afternoon: 14,
  Evening: 18,
  "Late Night": 22,
};

function wmoCodeToCondition(code: number): string {
  if (code === 0) return "☀️ Clear";
  if (code <= 2) return "🌤️ Partly Cloudy";
  if (code === 3) return "☁️ Overcast";
  if (code === 45 || code === 48) return "🌫️ Foggy";
  if (code >= 51 && code <= 67) return "🌧️ Rain";
  if (code >= 71 && code <= 77) return "❄️ Snow";
  if (code >= 80 && code <= 82) return "🌦️ Showers";
  if (code === 85 || code === 86) return "🌨️ Snow Showers";
  if (code >= 95) return "⛈️ Thunderstorm";
  return "🌡️ Unknown";
}

export async function fetchWeather(
  lat: number,
  lng: number,
  dateStr: string,
  timeOfDay: string | null
): Promise<WeatherResult | null> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00");
    const daysDiff = Math.round((today.getTime() - target.getTime()) / 86_400_000);

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: "temperature_2m,weather_code",
      timezone: "auto",
      temperature_unit: "fahrenheit",
    });

    let url: string;
    if (daysDiff > 5) {
      params.set("start_date", dateStr);
      params.set("end_date", dateStr);
      url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
    } else {
      params.set("past_days", "7");
      url = `https://api.open-meteo.com/v1/forecast?${params}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();
    const times: string[] = json?.hourly?.time ?? [];
    const temps: number[] = json?.hourly?.temperature_2m ?? [];
    const codes: number[] = json?.hourly?.weather_code ?? [];

    if (!times.length) return null;

    const targetHour = TIME_OF_DAY_HOURS[timeOfDay ?? ""] ?? 12;
    const targetPrefix = `${dateStr}T`;

    // Find all indices matching the date, then pick the closest hour
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      if (!times[i].startsWith(targetPrefix)) continue;
      const hourStr = times[i].slice(11, 13);
      const hour = parseInt(hourStr, 10);
      const diff = Math.abs(hour - targetHour);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;

    const tempF = Math.round(temps[bestIdx]);
    const condition = wmoCodeToCondition(codes[bestIdx]);

    return { tempF, condition };
  } catch {
    return null;
  }
}
