import { create } from "zustand";

type ToastState = { message: string | null };

const useStore = create<ToastState>(() => ({ message: null }));

/** 表示中のメッセージ。1 つだけ、新しいもので置換。消去タイマーは Toast.tsx */
export function useToast(): string | null {
  return useStore((s) => s.message);
}

export function showToast(message: string): void {
  useStore.setState({ message });
}

export function clearToast(): void {
  useStore.setState({ message: null });
}
