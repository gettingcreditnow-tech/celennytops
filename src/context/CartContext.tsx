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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // The server always renders an empty cart (no access to localStorage), so
  // the client's first render must match that or React throws a hydration
  // mismatch. Load whatever was persisted only after mount, once hydration
  // has already settled on the empty state.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "LOAD", state: JSON.parse(raw) as CartState });
    } catch {
      // corrupt or inaccessible storage - keep the empty cart
    }
  }, []);

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
