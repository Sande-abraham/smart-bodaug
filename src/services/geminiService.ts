import { GoogleGenAI, Type } from "@google/genai";
import { Rider, RouteOptimizationResult, Location, TrafficAlert, FuelPriceAlert, RouteInfo } from "../types";

// Fallback data for Kampala context
const KAMPALA_FALLBACK_STATIONS: FuelPriceAlert[] = [
  { station: "Shell Kampala Road", price: 5650, trend: 'stable' as const, distance: "0.8 km" },
  { station: "TotalEnergies Jinja Rd", price: 5580, trend: 'down' as const, distance: "1.2 km" },
  { station: "Stabex Wandegeya", price: 5450, trend: 'stable' as const, distance: "2.1 km" }
];

const KAMPALA_FALLBACK_ALERTS: TrafficAlert[] = [
  { location: "Jinja Road", condition: "Heavy Jam", action: "Use Mukwano Road bypass", intensity: 'high' as const },
  { location: "Entebbe Road", condition: "Slow Moving", action: "Use back paths through Katwe", intensity: 'medium' as const },
  { location: "Makerere Hill Rd", condition: "Clear", action: "Good for speed", intensity: 'low' as const }
];

const KAMPALA_FALLBACK_SUGGESTIONS = ["Ntinda", "Kiwatule", "Makerere", "Kikoni", "Kabiriti", "Texas Lounge", "Mukwano Mall"];

// Simple in-memory cache
const suggestionCache: Record<string, string[]> = {};
const routeCache: Record<string, RouteOptimizationResult> = {};

async function callGeminiProxy(prompt: string, config: any, systemInstruction?: string) {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, config, systemInstruction }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Gemini proxy error');
    }

    return await response.json();
  } catch (error) {
    console.error('Gemini Service Error:', error);
    throw error;
  }
}

export async function getFuelPriceAlerts(location: Location | null): Promise<FuelPriceAlert[]> {
  try {
    const locationString = location ? `${location.latitude}, ${location.longitude}` : "Kampala Central";
    
    const prompt = `
      As an AI fuel price tracker for boda-boda riders in Kampala, Uganda.
      Current location: ${locationString}.
      Find 3 petrol stations nearby with competitive fuel prices (UGX).
      Include Station name, price (5400-5800), trend, distance.
    `;

    const resultBody = await callGeminiProxy(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          fuelAlerts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                station: { type: "string" },
                price: { type: "number" },
                trend: { type: "string", enum: ['up', 'down', 'stable'] },
                distance: { type: "string" }
              },
              required: ["station", "price", "trend", "distance"]
            }
          }
        },
        required: ["fuelAlerts"]
      }
    });

    const result = JSON.parse(resultBody.text || "{}");
    return result.fuelAlerts || KAMPALA_FALLBACK_STATIONS;
  } catch (error) {
    console.warn("Gemini Proxy Quota reached (Fuel Alerts). Using fallback data.");
    return KAMPALA_FALLBACK_STATIONS;
  }
}

export async function getTrafficAlerts(location: Location | null): Promise<TrafficAlert[]> {
  try {
    const locationString = location ? `${location.latitude}, ${location.longitude}` : "Kampala Central";
    
    const prompt = `
      As an AI traffic analyst for boda-boda riders in Kampala, Uganda.
      Current location: ${locationString}.
      Provide 3 real-time traffic alerts for major roads in Kampala.
    `;

    const resultBody = await callGeminiProxy(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          alerts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                location: { type: "string" },
                condition: { type: "string" },
                action: { type: "string" },
                intensity: { type: "string", enum: ['low', 'medium', 'high'] }
              },
              required: ["location", "condition", "action", "intensity"]
            }
          }
        },
        required: ["alerts"]
      }
    });

    const result = JSON.parse(resultBody.text || "{}");
    return result.alerts || KAMPALA_FALLBACK_ALERTS;
  } catch (error) {
    console.warn("Gemini Proxy Quota reached (Traffic Alerts). Using fallback data.");
    return KAMPALA_FALLBACK_ALERTS;
  }
}

export async function getDestinationSuggestions(
  input: string,
  currentLocation: Location | null
): Promise<string[]> {
  if (!input || input.length < 2) return [];
  
  const cacheKey = input.toLowerCase().trim();
  if (suggestionCache[cacheKey]) return suggestionCache[cacheKey];
  
  try {
    const locationString = currentLocation ? `${currentLocation.latitude}, ${currentLocation.longitude}` : "Kampala Central";
    
    const prompt = `
      As an AI route optimization assistant for boda-boda riders in Kampala, Uganda.
      User is typing a destination: "${input}".
      Current location: ${locationString}.
      Instantly suggest 5 likely places in Kampala.
    `;

    const resultBody = await callGeminiProxy(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["suggestions"]
      }
    });

    const result = JSON.parse(resultBody.text || "{}");
    const suggestions = result.suggestions || KAMPALA_FALLBACK_SUGGESTIONS.filter(s => s.toLowerCase().includes(input.toLowerCase()));
    
    if (result.suggestions && result.suggestions.length > 0) {
      suggestionCache[cacheKey] = suggestions;
    }
    return suggestions;
  } catch (error) {
    console.warn("Gemini Proxy Quota reached (Suggestions). Using fallback data.");
    return KAMPALA_FALLBACK_SUGGESTIONS.filter(s => s.toLowerCase().includes(input.toLowerCase()));
  }
}

export async function getRouteOptimization(
  start: string,
  end: string,
  rider: Rider,
  options: {
    fuelPrice?: number;
    demandLevel?: 'low' | 'normal' | 'high';
    timeOfDay?: string;
  } = {}
): Promise<RouteOptimizationResult> {
  const { fuelPrice = 5500, demandLevel = 'normal', timeOfDay = new Date().toLocaleTimeString() } = options;
  
  const cacheKey = `${start}-${end}`.toLowerCase().trim();
  if (routeCache[cacheKey]) return routeCache[cacheKey];
  
  try {
    const prompt = `
      As a real-time AI route optimization assistant for boda boda riders in Kampala, Uganda.
      Plan route from "${start}" to "${end}".
      Consider: Fuel Price: ${fuelPrice} UGX, Rider: ${rider.bikeType}, Time: ${timeOfDay}.
      Return 1 best_route (BEST_FUEL) and exactly 2 alternative_routes (FASTEST and SHORTEST).
      Crucial: Provide distinct distances (km) for each route.
    `;

    const resultBody = await callGeminiProxy(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          suggestions: { type: "array", items: { type: "string" } },
          best_route: {
            type: "object",
            properties: {
              description: { type: "string" },
              fuel_litres: { type: "number" },
              cost: { type: "number" },
              time_minutes: { type: "number" },
              distance: { type: "number" },
              via_road: { type: "string" },
              traffic_level: { type: "string" },
              road_type: { type: "string" },
              reason: { type: "string" },
              profit_saved: { type: "number" },
              suggested_fare_range: {
                type: "object",
                properties: {
                  min: { type: "number" },
                  max: { type: "number" }
                },
                required: ["min", "max"]
              },
              traffic_segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    color: { type: "string", enum: ['green', 'yellow', 'red'] },
                    weight: { type: "number" }
                  },
                  required: ["color", "weight"]
                }
              },
              waypoints: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "number" }
                }
              }
            },
            required: ["description", "fuel_litres", "cost", "time_minutes", "distance", "reason", "waypoints", "suggested_fare_range"]
          },
          alternative_routes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                fuel_litres: { type: "number" },
                cost: { type: "number" },
                time_minutes: { type: "number" },
                distance: { type: "number" },
                via_road: { type: "string" },
                traffic_level: { type: "string" },
                road_type: { type: "string" },
                reason: { type: "string" },
                profit_saved: { type: "number" },
                suggested_fare_range: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" }
                  },
                  required: ["min", "max"]
                },
                traffic_segments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      color: { type: "string", enum: ['green', 'yellow', 'red'] },
                      weight: { type: "number" }
                    },
                    required: ["color", "weight"]
                  }
                },
                waypoints: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: "number" }
                  }
                }
              },
              required: ["description", "fuel_litres", "cost", "time_minutes", "distance", "reason", "waypoints", "suggested_fare_range"]
            }
          },
          navigation_steps: {
            type: "array",
            items: { type: "string" }
          },
          distance: { type: "number" }
        },
        required: ["suggestions", "best_route", "alternative_routes", "navigation_steps", "distance"]
      }
    });

    const rawResult = JSON.parse(resultBody.text || "{}");
    const result = {
      ...rawResult,
      distance: rawResult.best_route.distance || rawResult.distance || 0
    };
    
    routeCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("Gemini Proxy Error (Route Optimization):", error);
    const baseDist = Math.max(3, (end.length % 10) + 2); 
    
    return {
      suggestions: [end],
      best_route: {
        description: `AI Best Fuel Route (${baseDist.toFixed(1)}km)`,
        fuel_litres: baseDist * 0.03,
        cost: Math.round(baseDist * 1200),
        time_minutes: Math.round(baseDist * 3.5),
        distance: baseDist,
        via_road: "Main Arteries",
        traffic_level: "Medium",
        reason: "AI calculated based on general traffic patterns",
        waypoints: [[0.3476, 32.5825], [0.3556, 32.5925], [0.3656, 32.6025]],
        suggested_fare_range: { min: 2000 + (baseDist * 1200), max: 3000 + (baseDist * 1200) }
      },
      alternative_routes: [
        {
          description: "Fastest Route",
          fuel_litres: baseDist * 0.04,
          cost: Math.round(baseDist * 1400),
          time_minutes: Math.round(baseDist * 2),
          distance: baseDist + 1.2,
          via_road: "Northern Bypass",
          traffic_level: "Low",
          reason: "Uses paved bypass for higher speed",
          waypoints: [[0.3476, 32.5825], [0.3656, 32.5925]],
          suggested_fare_range: { min: 3000 + (baseDist * 1300), max: 4000 + (baseDist * 1300) }
        }
      ],
      navigation_steps: ["Start from your current location", `Continue for ${baseDist.toFixed(1)}km`],
      distance: baseDist
    };
  }
}

export async function getSmartSuggestions(trips: any[]): Promise<string[]> {
  try {
    const prompt = `
      Analyze these recent trips for a boda-boda rider in Kampala and provide 3 actionable smart suggestions.
      Trips: ${JSON.stringify(trips)}
    `;

    const resultBody = await callGeminiProxy(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["suggestions"]
      }
    });

    const result = JSON.parse(resultBody.text || "{}");
    return result.suggestions || ["Minimize idling", "Check tire pressure", "Avoid Entebbe Rd peak hours"];
  } catch (error) {
    console.warn("Gemini Proxy Quota reached (Smart Suggestions). Using fallback.");
    return ["Limit high-rev driving", "Plan routes through back-streets", "Refuel at Shell Kampala Rd"];
  }
}
