"use client";

import { createContext, useContext, useEffect, useReducer } from "react";
import { cartReducer, type CartItem, type CartState } from "@/lib/cart";

const STORAGE_KEY = "celenny-cart";

type CartContextValue = {
  state: CartState;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadInitialState(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartState) : { items: [] };
  } catch {
    return { items: [] };
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] }, loadInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value: CartContextValue = {
    state,
    addItem: (item) => dispatch({ type: "ADD_ITEM", item }),
    removeItem: (variantId) => dispatch({ type: "REMOVE_ITEM", variantId }),
    setQuantity: (variantId, quantity) =>
      dispatch({ type: "SET_QUANTITY", variantId, quantity }),
    clear: () => dispatch({ type: "CLEAR" }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
