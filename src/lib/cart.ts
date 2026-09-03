export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
};

export type CartState = { items: CartItem[] };

export type CartAction =
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; variantId: string }
  | { type: "SET_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR" };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.variantId === action.item.variantId);
      if (existing) {
        const quantity = Math.min(
          existing.quantity + action.item.quantity,
          existing.maxStock
        );
        return {
          items: state.items.map((i) =>
            i.variantId === action.item.variantId ? { ...i, quantity } : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { ...action.item, quantity: Math.min(action.item.quantity, action.item.maxStock) },
        ],
      };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => i.variantId !== action.variantId) };
    case "SET_QUANTITY": {
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.variantId !== action.variantId) };
      }
      return {
        items: state.items.map((i) =>
          i.variantId === action.variantId
            ? { ...i, quantity: Math.min(action.quantity, i.maxStock) }
            : i
        ),
      };
    }
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}
