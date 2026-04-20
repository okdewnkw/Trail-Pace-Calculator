import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(hours: number): string {
  if (!isFinite(hours) || isNaN(hours)) return "00:00:00";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.round(((hours - h) * 60 - m) * 60);
  
  const paddedH = h.toString().padStart(2, '0');
  const paddedM = m.toString().padStart(2, '0');
  const paddedS = s.toString().padStart(2, '0');
  
  return `${paddedH}:${paddedM}:${paddedS}`;
}

export function addHoursToTimeStr(startTimeStr: string, addHours: number): string {
  // startTimeStr like "06:00"
  let [h, m] = startTimeStr.split(':').map(Number);
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;
  
  const totalMinutes = h * 60 + m + addHours * 60;
  const resH = Math.floor(totalMinutes / 60) % 24;
  const resM = Math.round(totalMinutes % 60);
  
  return `${resH.toString().padStart(2, '0')}:${resM.toString().padStart(2, '0')}`;
}
