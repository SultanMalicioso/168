import { useEffect, useState } from "react";

export type Category =
  | "salud"
  | "trabajo"
  | "estudio"
  | "deporte"
  | "ocio"
  | "social"
  | "transporte"
  | "otro";

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "salud", label: "Salud", color: "var(--chart-2)" },
  { id: "trabajo", label: "Trabajo", color: "var(--chart-1)" },
  { id: "estudio", label: "Estudio", color: "var(--chart-5)" },
  { id: "deporte", label: "Deporte", color: "var(--chart-4)" },
  { id: "ocio", label: "Ocio", color: "var(--chart-3)" },
  { id: "social", label: "Social", color: "var(--chart-7)" },
  { id: "transporte", label: "Transporte", color: "var(--chart-6)" },
  { id: "otro", label: "Otro", color: "var(--chart-8)" },
];

export interface Activity {
  id: string;
  name: string;
  hoursPerDay: number;
  daysPerWeek: number;
  color: string;
  category: Category;
  permanent?: boolean;
  notes?: string;
}

export interface Goal {
  id: string;
  activityName: string;
  minHours: number;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export function nextColor(existing: Activity[]): string {
  const used = new Set(existing.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export const weeklyHours = (a: Activity) => a.hoursPerDay * a.daysPerWeek;

const KEY = "week168.v1";

interface Store {
  activities: Activity[];
  goals: Goal[];
  theme: "light" | "dark";
}

const defaultStore: Store = {
  activities: [
    { id: "seed-1", name: "Dormir", hoursPerDay: 8, daysPerWeek: 7, color: PALETTE[0], category: "salud", permanent: true },
    { id: "seed-2", name: "Trabajo", hoursPerDay: 8, daysPerWeek: 5, color: PALETTE[1], category: "trabajo", permanent: true },
    { id: "seed-3", name: "Comer", hoursPerDay: 1.5, daysPerWeek: 7, color: PALETTE[2], category: "salud", permanent: true },
    { id: "seed-4", name: "Gimnasio", hoursPerDay: 1, daysPerWeek: 4, color: PALETTE[3], category: "deporte", permanent: true },
    { id: "seed-5", name: "Ocio", hoursPerDay: 2, daysPerWeek: 7, color: PALETTE[4], category: "ocio" },
  ],
  goals: [
    { id: "g1", activityName: "Dormir", minHours: 56 },
    { id: "g2", activityName: "Gimnasio", minHours: 4 },
  ],
  theme: "light",
};

export function useTimeStore() {
  const [store, setStore] = useState<Store>(defaultStore);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setStore({ ...defaultStore, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {}
  }, [store, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", store.theme === "dark");
  }, [store.theme, hydrated]);

  return { store, setStore, hydrated };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
