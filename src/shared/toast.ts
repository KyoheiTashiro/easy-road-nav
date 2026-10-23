import { create } from "zustand";

type ToastState = { message: string | null };

const useStore = create<ToastState>(() => ({ message: null }));

export const useToast = useStore;

export function showToast(message: string): void {
  useStore.setState({ message });
}

export function clearToast(): void {
  useStore.setState({ message: null });
}
