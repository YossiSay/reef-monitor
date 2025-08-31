// src/components/Dashboard/SensorRegistry.js
import { Activity, Thermometer, Droplets, Beaker } from "lucide-react";
import { theme } from "@/components/Common";

const colorByRules = (value, { rules, defaultColor }) => {
  if (!Number.isFinite(value)) return theme.color.ink;
  for (const r of rules || []) {
    if (r.between) {
      const [min, max] = r.between;
      if (value >= min && value <= max) return r.color;
    } else if (r.outside) {
      const [min, max] = r.outside;
      if (value < min || value > max) return r.color;
    }
  }
  return defaultColor;
};

export const SensorRegistry = {
  temperature: {
    title: "Temperature",
    Icon: Thermometer,
    unit: "°C",
    accent: theme.color.ocean,
    thresholds: {
      rules: [
        { outside: [24, 27], color: theme.color.danger }, // critical <24 or >27
        { between: [24, 25], color: theme.color.alert },  // warning 24–25
        { between: [26, 27], color: theme.color.alert },  // warning 26–27
      ],
      defaultColor: theme.color.aqua, // good 25–26
    },
  },

  ph: {
    title: "pH",
    Icon: Beaker,
    unit: "pH",
    accent: theme.color.aqua,
    thresholds: {
      rules: [
        { outside: [7.9, 8.5], color: theme.color.danger }, // critical <7.9 or >8.5
        { between: [7.9, 8.1], color: theme.color.alert },  // warning 7.9–8.1
        { between: [8.4, 8.5], color: theme.color.alert },  // warning 8.4–8.5
      ],
      defaultColor: theme.color.aqua, // good 8.1–8.4
    },
  },

  salinity: {
    title: "Salinity",
    Icon: Droplets,
    unit: "SG", // display in SG (input may be ppt)
    accent: theme.color.alert,
    transformValue: (ppt) => 1 + Number(ppt) * 0.00071, // ~35 ppt ≈ 1.025
    thresholds: {
      rules: [
        { outside: [1.023, 1.027], color: theme.color.danger }, // critical <1.023 or >1.027
        { between: [1.023, 1.025], color: theme.color.alert },  // warning 1.023–1.025
        { between: [1.026, 1.027], color: theme.color.alert },  // warning 1.026–1.027
      ],
      defaultColor: theme.color.ocean, // good 1.025–1.026
    },
  },
};

// Attach getColor dynamically
Object.values(SensorRegistry).forEach((meta) => {
  const { thresholds, transformValue } = meta;
  meta.getColor = (raw) => {
    const v = transformValue ? transformValue(raw) : raw;
    return colorByRules(v, thresholds);
  };
});

// Unknown sensors
export const fallbackSensor = (key) => ({
  title: key.replace(/\b\w/g, (c) => c.toUpperCase()),
  Icon: Activity,
  unit: "",
  accent: theme.color.ocean,
  getColor: (n) => (Number.isFinite(n) ? theme.color.ocean : theme.color.ink),
});
